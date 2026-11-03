import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

IMPORTER = Path(__file__).resolve().parents[1] / "scripts/import-xauusd-history.py"


class XauusdHistoryImportTests(unittest.TestCase):
    def test_cross_year_exact_m1_and_only_complete_aggregate(self):
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            source = base / "bars.csv"
            source.write_text(
                "time,open,high,low,close,volume\n"
                "2025-12-31 23:58:00,10,11,9,10.5,300\n"
                "2025-12-31 23:59:00,10.5,11,10,11,500\n" +
                "".join(f"2026-01-01T00:0{minute}:00Z,{10+minute},{12+minute},9,{11+minute},900\n"
                        for minute in range(5)) +
                "2026-01-01T00:07:00Z,16,17,15,16,500\n",
                encoding="utf-8",
            )
            digest = hashlib.sha256(source.read_bytes()).hexdigest()
            out = base / "sim"
            command = [sys.executable, str(IMPORTER), str(source), "--output", str(out)]
            result = subprocess.run(command + ["--expected-sha256", digest], capture_output=True, text=True, check=True)
            receipt = json.loads(result.stdout)
            self.assertEqual(receipt["m1_rows"], 8)
            self.assertEqual(receipt["derived_timeframes"]["D1"]["rows"], 0)
            self.assertFalse((out / "ohlc_XAUUSD_D1.json").exists())
            self.assertEqual(receipt["m1_gaps"]["2_to_60_minutes"], 1)
            self.assertEqual(receipt["derived_timeframes"]["M5"], {"rows": 1, "incomplete_omitted": 2})
            read = lambda name: json.loads((out / f"ohlc_XAUUSD_{name}.json").read_text())
            self.assertEqual([year["n"] for year in read("M1_years")["years"]], [2, 6])
            self.assertEqual(read("M5")["bars"], [{"o": 10, "h": 16, "l": 9, "c": 15,
                                                    "i": 0, "t": "2026-01-01T00:00:00", "r": "N"}])
            self.assertTrue(all("volume" not in bar and "vol" not in bar for bar in read("M1")["bars"]))
            self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(), digest)
            self.assertNotEqual(subprocess.run(command, capture_output=True).returncode, 0)

    def test_invalid_timestamp_rejected_without_activation(self):
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            source = base / "bars.csv"
            for stamp in ("2026-01-01T00:00:00Z", "2026-01-01T00:01:00+02:00"):
                source.write_text("time,open,high,low,close\n2026-01-01T00:00:00Z,10,11,9,10\n" +
                                  f"{stamp},10,11,9,10\n", encoding="utf-8")
                out = base / "sim"
                command = [sys.executable, str(IMPORTER), str(source), "--output", str(out)]
                result = subprocess.run(command, capture_output=True, text=True)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("CSV line 3", result.stderr)
                self.assertFalse(out.exists())
                self.assertEqual(list(base.iterdir()), [source])


if __name__ == "__main__":
    unittest.main()
