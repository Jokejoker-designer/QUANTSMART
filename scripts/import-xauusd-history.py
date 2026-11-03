"""Validate a UTC M1 CSV and build QUANTSMART's local OHLC history files."""

import argparse
import csv
from datetime import datetime, timezone
from hashlib import sha256
import json
import math
from pathlib import Path
from collections import deque
from tempfile import TemporaryDirectory

TIMEFRAMES = {"M5": 5, "M15": 15, "M30": 30, "H1": 60, "H4": 240, "D1": 1440}
COLUMNS = ("time", "open", "high", "low", "close")


class Tape:
    """Write a JSON array incrementally, then add the existing tape envelope."""

    def __init__(self, directory, name, tf):
        self.path = directory / name
        self.tf = tf
        self.count = 0
        self.first = self.last = None
        self.body = self.path.with_suffix(".body")
        self.stream = self.body.open("w", encoding="utf-8")

    def append(self, stamp, prices):
        if self.count:
            self.stream.write(",")
        else:
            self.first = stamp
        bar = dict(zip(("o", "h", "l", "c"), prices))
        bar.update(i=self.count, t=stamp, r="N")
        self.stream.write(json.dumps(bar, separators=(",", ":"), allow_nan=False))
        self.count += 1
        self.last = stamp

    def finish(self):
        self.stream.close()
        if self.count == 0:
            self.body.unlink()
            return
        header = {"symbol": "XAUUSD", "timeframe": self.tf,
                  "source": "local_utc_m1_ohlc", "n": self.count}
        with self.path.open("wb") as out, self.body.open("rb") as body:
            out.write(json.dumps(header, separators=(",", ":")).encode()[:-1] + b',"bars":[')
            while chunk := body.read(1024 * 1024):
                out.write(chunk)
            out.write(b"]}\n")
        self.body.unlink()


class Bucket:
    def __init__(self, minutes, tape):
        self.minutes = minutes
        self.tape = tape
        self.key = None
        self.incomplete = 0

    def append(self, minute, stamp, prices):
        key = minute // self.minutes
        if key != self.key:
            self.flush()
            self.key = key
            self.count = 0
            self.start = stamp
            self.prices = prices[:]
        else:
            self.prices[1] = max(self.prices[1], prices[1])
            self.prices[2] = min(self.prices[2], prices[2])
            self.prices[3] = prices[3]
        self.count += 1

    def flush(self):
        if self.key is None:
            return
        if self.count == self.minutes:
            self.tape.append(self.start, self.prices)
        else:
            self.incomplete += 1


def file_hash(path):
    with path.open("rb") as stream:
        digest = sha256()
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
        return digest.hexdigest()


def read_candles(source):
    with source.open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        header = reader.fieldnames or []
        if len(header) != len(set(header)) or not set(COLUMNS).issubset(header):
            raise ValueError("CSV must contain unique time,open,high,low,close columns")
        previous = -1
        for row in reader:
            try:
                if None in row or any(row[column] is None for column in COLUMNS):
                    raise ValueError("invalid column count")
                dt = datetime.fromisoformat(row["time"].strip())
                if dt.utcoffset() not in (None, timezone.utc.utcoffset(dt)):
                    raise ValueError("timestamp must be UTC")
                dt = dt.replace(tzinfo=timezone.utc)
                if dt.second or dt.microsecond:
                    raise ValueError("timestamp must align to a minute")
                minute = int(dt.timestamp()) // 60
                if minute <= previous:
                    raise ValueError("duplicate or out-of-order timestamp")
                prices = [float(row[name]) for name in COLUMNS[1:]]
                if not all(math.isfinite(price) and price > 0 for price in prices):
                    raise ValueError("invalid price")
                o, h, l, c = prices
                if not l <= min(o, c) <= max(o, c) <= h:
                    raise ValueError("inconsistent OHLC")
            except (ValueError, TypeError, OverflowError) as error:
                raise ValueError(f"CSV line {reader.line_num}: {error}") from error
            previous = minute
            yield minute, dt.isoformat(timespec="seconds")[:-6], prices


def build(source, directory, digest):
    annual = []
    buckets = [Bucket(minutes, Tape(directory, f"ohlc_XAUUSD_{tf}.json", tf))
               for tf, minutes in TIMEFRAMES.items()]
    tail = deque(maxlen=250000)
    current = None
    previous = None
    gaps = [0, 0, 0]
    rows = 0
    try:
        for minute, stamp, prices in read_candles(source):
            year = stamp[:4]
            if current is None or year != annual[-1][0]:
                if current:
                    current.finish()
                current = Tape(directory, f"ohlc_XAUUSD_M1_{year}.json", "M1")
                annual.append((year, current))
            current.append(stamp, prices)
            tail.append((stamp, prices))
            for bucket in buckets:
                bucket.append(minute, stamp, prices)
            if previous is not None and minute - previous > 1:
                interval = minute - previous
                gaps[0 if interval <= 60 else 1 if interval <= 2880 else 2] += 1
            rows += 1
            previous = minute
        if current is None:
            raise ValueError("CSV contains no candles")
        current.finish()
        for bucket in buckets:
            bucket.flush()
            bucket.tape.finish()
    finally:
        for tape in [*(tape for _, tape in annual), *(bucket.tape for bucket in buckets)]:
            tape.stream.close()

    recent = Tape(directory, "ohlc_XAUUSD_M1.json", "M1")
    try:
        for stamp, prices in tail:
            recent.append(stamp, prices)
        recent.finish()
    finally:
        recent.stream.close()
    years = [{"year": year, "n": tape.count, "first": tape.first, "last": tape.last,
              "file": tape.path.name, "mb": round(tape.path.stat().st_size / 1e6, 2)}
             for year, tape in annual]
    (directory / "ohlc_XAUUSD_M1_years.json").write_text(json.dumps(
        {"symbol": "XAUUSD", "timeframe": "M1", "years": years}), encoding="utf-8")
    if file_hash(source) != digest:
        raise ValueError("Source changed during conversion")
    receipt = {
        "source_name": source.name, "source_sha256": digest, "m1_rows": rows,
        "first_utc": years[0]["first"], "last_utc": years[-1]["last"],
        "m1_gaps": {"2_to_60_minutes": gaps[0], "61_to_2880_minutes": gaps[1],
                    "over_2880_minutes": gaps[2]},
        "derived_timeframes": {b.tape.tf: {"rows": b.tape.count, "incomplete_omitted": b.incomplete}
                               for b in buckets},
        "files": {p.name: file_hash(p) for p in sorted(directory.glob("ohlc_*.json"))},
    }
    (directory / "xauusd-history-receipt.json").write_text(json.dumps(receipt, indent=2), encoding="utf-8")
    return receipt


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv", type=Path)
    parser.add_argument("--output", required=True, type=Path, help="New directory. Existing data is never replaced.")
    parser.add_argument("--expected-sha256", help="Require the exact registered raw source hash.")
    args = parser.parse_args()
    source = args.csv.resolve(strict=True)
    target = args.output.resolve()
    if target.exists() or not target.parent.is_dir():
        parser.error("Output must be a new directory inside an existing parent")
    digest = file_hash(source)
    if args.expected_sha256 and args.expected_sha256.lower() != digest:
        parser.error(f"Source SHA-256 mismatch. Read {digest}")
    # Stage on the same filesystem. Failed validation leaves no output directory.
    with TemporaryDirectory(prefix=".quantsmart-history-", dir=target.parent) as staging:
        tape = Path(staging) / "sim"
        tape.mkdir()
        receipt = build(source, tape, digest)
        if target.exists():
            parser.error("Output appeared during conversion")
        tape.rename(target)
    print(json.dumps(receipt, indent=2))


if __name__ == "__main__":
    main()
