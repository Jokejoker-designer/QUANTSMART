"""Durable quote evidence. No order API, account mutation or strategy consumer."""
from __future__ import annotations

import hashlib
import json
import math
import secrets
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path

AUTHORITY={"authority":"SHADOW_ONLY","decision":"NO_DECISION","live_apply_allowed":False,"exchange_order_flow":False}


def canonical(value):
    return json.dumps(value,sort_keys=True,separators=(",",":"),allow_nan=False)


def digest(value):
    return hashlib.sha256(canonical(value).encode()).hexdigest()


def now_iso():
    return datetime.now(timezone.utc).isoformat()


class TickEvidenceStore:
    def __init__(self,path:Path,max_rows=250000,max_bytes=256*1024*1024):
        self.path=Path(path);self.path.parent.mkdir(parents=True,exist_ok=True)
        self.lease=None
        self.max_rows=max_rows;self.max_bytes=max_bytes;self.lock=threading.RLock()
        self.db=sqlite3.connect(self.path,check_same_thread=False,timeout=10)
        self.db.execute("PRAGMA journal_mode=WAL");self.db.execute("PRAGMA synchronous=FULL")
        self.db.executescript("""
          CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS sources(id TEXT PRIMARY KEY,payload TEXT NOT NULL,raw_ms INTEGER NOT NULL DEFAULT 0,ordinal INTEGER NOT NULL DEFAULT 0);
          CREATE TABLE IF NOT EXISTS ticks(source TEXT NOT NULL,raw_ms INTEGER NOT NULL,ordinal INTEGER NOT NULL,utc_ms INTEGER NOT NULL,bid REAL NOT NULL,ask REAL NOT NULL,last REAL NOT NULL,flags INTEGER NOT NULL,volume REAL,received_at TEXT NOT NULL,hash TEXT NOT NULL,PRIMARY KEY(source,raw_ms,ordinal));
          CREATE INDEX IF NOT EXISTS tick_time ON ticks(source,utc_ms,raw_ms,ordinal);
          CREATE TABLE IF NOT EXISTS batches(id TEXT PRIMARY KEY,source TEXT NOT NULL,payload TEXT NOT NULL,hash TEXT NOT NULL,committed_at TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS quality(id INTEGER PRIMARY KEY,at TEXT NOT NULL,source TEXT,state TEXT NOT NULL,detail TEXT NOT NULL);
        """)
        if "hash" not in {row[1] for row in self.db.execute("PRAGMA table_info(sources)")}:
            self.db.execute("ALTER TABLE sources ADD COLUMN hash TEXT")
            for sid,payload in self.db.execute("SELECT id,payload FROM sources").fetchall():self.db.execute("UPDATE sources SET hash=? WHERE id=?",(digest(json.loads(payload)),sid))
            self.db.commit()
        if self.db.execute("PRAGMA quick_check").fetchone()[0]!="ok":raise ValueError("EVIDENCE_STORAGE_INTEGRITY")
        if self.get("salt") is None:self.put("salt",secrets.token_hex(32))

    def close(self):
        with self.lock:self.release_lease();self.db.close()

    def acquire_lease(self):
        if self.lease:return
        handle=open(str(self.path)+".recorder.lock","a+b")
        if handle.tell()==0:handle.write(b"1");handle.flush()
        handle.seek(0)
        try:
            import os
            if os.name=="nt":
                import msvcrt
                msvcrt.locking(handle.fileno(),msvcrt.LK_NBLCK,1)
            else:
                import fcntl
                fcntl.flock(handle,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except OSError:
            handle.close();raise ValueError("RECORDER_ALREADY_OWNED")
        self.lease=handle

    def release_lease(self):
        if self.lease:self.lease.close();self.lease=None

    def get(self,key,default=None):
        with self.lock:
            row=self.db.execute("SELECT value FROM meta WHERE key=?",(key,)).fetchone()
            return json.loads(row[0]) if row else default

    def put(self,key,value):
        with self.lock,self.db:self.db.execute("INSERT OR REPLACE INTO meta VALUES(?,?)",(key,canonical(value)))

    def cursor(self,source):
        with self.lock:
            row=self.db.execute("SELECT raw_ms,ordinal FROM sources WHERE id=?",(source,)).fetchone()
            tail=self.db.execute("SELECT raw_ms,ordinal FROM ticks WHERE source=? ORDER BY raw_ms DESC,ordinal DESC LIMIT 1",(source,)).fetchone()
            if row and tuple(row)!=(tuple(tail) if tail else (0,0)):raise ValueError("EVIDENCE_CURSOR_INTEGRITY")
            return tuple(row) if row else (0,0)

    def event(self,source,state,detail=""):
        with self.lock,self.db:
            if self.db.execute("SELECT count(*) FROM quality").fetchone()[0]>=10000:raise ValueError("QUALITY_EVENT_CAPACITY_REACHED")
            self.db.execute("INSERT INTO quality(at,source,state,detail) VALUES(?,?,?,?)",(now_iso(),source,state,detail))

    @staticmethod
    def tick_payload(row):
        return dict(raw_time_msc=row[0],source_ordinal=row[1],time_msc=row[2],bid=row[3],ask=row[4],last=row[5],flags=row[6],volume=row[7])

    def append(self,packet):
        source=packet.get("source",{});sid=source.get("id")
        if not isinstance(sid,str) or not sid or len(sid)>128:raise ValueError("INVALID_EVIDENCE_SOURCE")
        if not packet.get("ok") or not isinstance(packet.get("ticks"),list) or len(packet["ticks"])>8192:raise ValueError("INVALID_EVIDENCE_BATCH")
        rows=[];previous=None
        for tick in packet["ticks"]:
            values=[tick.get(k) for k in ("raw_time_msc","source_ordinal","time_msc","bid","ask","last","flags")]
            if any(isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v) for v in values):raise ValueError("INVALID_EVIDENCE_QUOTE")
            raw,ordinal,utc,bid,ask,last,flags=values
            if any(not isinstance(v,int) or v<0 for v in (raw,ordinal,utc,flags)) or ordinal<1 or bid<=0 or ask<bid:raise ValueError("INVALID_EVIDENCE_QUOTE")
            if previous is not None and (raw,ordinal)<=previous:raise ValueError("EVIDENCE_BATCH_ORDER")
            previous=(raw,ordinal)
            volume=tick.get("volume")
            if volume is not None and (not isinstance(volume,(int,float)) or not math.isfinite(volume) or volume<0):raise ValueError("INVALID_EVIDENCE_VOLUME")
            payload=dict(raw_time_msc=raw,source_ordinal=ordinal,time_msc=utc,bid=float(bid),ask=float(ask),last=float(last),flags=flags,volume=None if volume is None else float(volume))
            rows.append((payload,digest(payload)))
        with self.lock,self.db:
            old=self.db.execute("SELECT payload,raw_ms,ordinal FROM sources WHERE id=?",(sid,)).fetchone()
            if old and json.loads(old[0])!=source:raise ValueError("EVIDENCE_SOURCE_CONFLICT")
            additions=[]
            for payload,h in rows:
                found=self.db.execute("SELECT hash FROM ticks WHERE source=? AND raw_ms=? AND ordinal=?",(sid,payload["raw_time_msc"],payload["source_ordinal"])).fetchone()
                if found:
                    if found[0]!=h:raise ValueError("EVIDENCE_TICK_CONFLICT")
                else:
                    if old and (payload["raw_time_msc"],payload["source_ordinal"])<=(old[1],old[2]):raise ValueError("EVIDENCE_CURSOR_REWIND")
                    additions.append((payload,h))
            count=self.db.execute("SELECT count(*) FROM ticks").fetchone()[0]
            size=sum(p.stat().st_size for p in (self.path,Path(str(self.path)+"-wal")) if p.exists())
            if count+len(additions)>self.max_rows or size+len(additions)*512>self.max_bytes:raise ValueError("EVIDENCE_CAPACITY_REACHED")
            config=self.get("recorder")
            if old and not additions:
                if config and config.get("enabled") and config.get("source_id") is None:self.db.execute("INSERT OR REPLACE INTO meta VALUES('recorder',?)",(canonical({**config,"source_id":sid}),))
                return {"inserted":0,"duplicates":len(rows),"cursor":[old[1],old[2]]}
            self.db.execute("INSERT OR IGNORE INTO sources(id,payload,hash) VALUES(?,?,?)",(sid,canonical(source),digest(source)))
            previous_utc=self.db.execute("SELECT max(utc_ms) FROM ticks WHERE source=?",(sid,)).fetchone()[0]
            gap_pairs=[]
            for p,h in additions:
                if previous_utc is not None and p["time_msc"]-previous_utc>30000:gap_pairs.append((previous_utc,p["time_msc"]))
                if previous_utc is not None and p["time_msc"]<previous_utc:raise ValueError("EVIDENCE_UTC_TIME_REWIND")
                previous_utc=p["time_msc"]
                self.db.execute("INSERT INTO ticks VALUES(?,?,?,?,?,?,?,?,?,?,?)",(sid,p["raw_time_msc"],p["source_ordinal"],p["time_msc"],p["bid"],p["ask"],p["last"],p["flags"],p["volume"],packet.get("received_at") or now_iso(),h))
            if gap_pairs:
                self.db.execute("INSERT INTO quality(at,source,state,detail) VALUES(?,?,?,?)",(now_iso(),sid,"UNKNOWN_QUOTE_INTERVAL",canonical({"intervals":gap_pairs[:20],"threshold_ms":30000,"meaning":"Observed quiet interval; broker closure/outage not determined."})))
            end=(old[1],old[2]) if old else (0,0)
            if rows:end=max(end,(rows[-1][0]["raw_time_msc"],rows[-1][0]["source_ordinal"]))
            batch=dict(source=sid,cursor_before=list((old[1],old[2]) if old else (0,0)),cursor_after=list(end),row_hashes=[h for _,h in additions])
            if additions:
                key=digest(batch)
                self.db.execute("INSERT INTO batches VALUES(?,?,?,?,?)",(key,sid,canonical(batch),key,now_iso()))
            self.db.execute("UPDATE sources SET raw_ms=?,ordinal=? WHERE id=?",(*end,sid))
            config=self.get("recorder")
            if config and config.get("enabled") and config.get("source_id") is None:
                self.db.execute("INSERT OR REPLACE INTO meta VALUES('recorder',?)",(canonical({**config,"source_id":sid}),))
        return {"inserted":len(additions),"duplicates":len(rows)-len(additions),"cursor":list(end)}

    def replay(self,source,after_ms=0,limit=1000,after_raw_ms=0,after_ordinal=0):
        limit=max(1,min(int(limit),10000))
        with self.lock:
            records=self.db.execute("SELECT raw_ms,ordinal,utc_ms,bid,ask,last,flags,volume,hash FROM ticks WHERE source=? AND (utc_ms>? OR utc_ms=? AND (raw_ms>? OR raw_ms=? AND ordinal>?)) ORDER BY utc_ms,raw_ms,ordinal LIMIT ?",(source,int(after_ms),int(after_ms),int(after_raw_ms),int(after_raw_ms),int(after_ordinal),limit)).fetchall()
            ticks=[]
            for row in records:
                value=self.tick_payload(row)
                if digest(value)!=row[8]:raise ValueError("EVIDENCE_TICK_INTEGRITY")
                ticks.append(value)
            next_cursor={"after_ms":ticks[-1]["time_msc"],"after_raw_ms":ticks[-1]["raw_time_msc"],"after_ordinal":ticks[-1]["source_ordinal"]} if ticks else None
            return {"source_id":source,"ticks":ticks,"limit":limit,"next_cursor":next_cursor,"ordering":"UTC_MS_RAW_MS_ORDINAL","partial":len(ticks)==limit,**AUTHORITY}

    def status(self):
        with self.lock:
            count=self.db.execute("SELECT count(*) FROM ticks").fetchone()[0]
            sources=[]
            for sid,payload,raw,ordinal,h in self.db.execute("SELECT id,payload,raw_ms,ordinal,hash FROM sources ORDER BY id"):
                if digest(json.loads(payload))!=h:raise ValueError("EVIDENCE_SOURCE_INTEGRITY")
                stats=self.db.execute("SELECT count(*),min(utc_ms),max(utc_ms) FROM ticks WHERE source=?",(sid,)).fetchone()
                sources.append({**json.loads(payload),"rows":stats[0],"from_ms":stats[1],"to_ms":stats[2],"cursor":[raw,ordinal]})
            quality=[dict(id=r[0],at=r[1],source_id=r[2],state=r[3],detail=r[4]) for r in self.db.execute("SELECT id,at,source,state,detail FROM quality ORDER BY id DESC LIMIT 100")]
            return {"rows":count,"max_rows":self.max_rows,"max_bytes":self.max_bytes,"sources":sources,"quality":quality,"storage":"BACKEND_SQLITE_WAL_FULL","market_closure":"NOT_VERIFIED","qualification":"UNCERTIFIED",**AUTHORITY}

    def integrity(self):
        with self.lock:
            if self.db.execute("PRAGMA quick_check").fetchone()[0]!="ok":raise ValueError("EVIDENCE_STORAGE_INTEGRITY")
            for sid,payload,h in self.db.execute("SELECT id,payload,hash FROM sources"):
                if digest(json.loads(payload))!=h:raise ValueError("EVIDENCE_SOURCE_INTEGRITY")
                self.cursor(sid)
            count=0
            for row in self.db.execute("SELECT raw_ms,ordinal,utc_ms,bid,ask,last,flags,volume,hash FROM ticks"):
                if digest(self.tick_payload(row))!=row[8]:raise ValueError("EVIDENCE_TICK_INTEGRITY")
                count+=1
            for key,payload,h in self.db.execute("SELECT id,payload,hash FROM batches"):
                if digest(json.loads(payload))!=h or key!=h:raise ValueError("EVIDENCE_BATCH_INTEGRITY")
            return {"ok":True,"verified_rows":count,"checked_at":now_iso(),"scope":"SQLITE_AND_STORED_ROW_BATCH_HASHES_NOT_BROKER_COMPLETENESS",**AUTHORITY}


class TickRecorder:
    def __init__(self,store,provider,interval=.5,on_commit=None):
        self.store=store;self.provider=provider;self.interval=interval
        self.on_commit=on_commit
        self.lock=threading.RLock();self.poll_lock=threading.Lock();self.halt=threading.Event();self.thread=None
        self.intent=store.get("recorder",{"enabled":False,"symbol":"XAUUSD","source_id":None})
        self.state="WAITING_FOR_SOURCE" if self.intent["enabled"] else "STOPPED"
        self.last_poll=None;self.last_commit=None;self.inserted=0;self.duplicates=0
        self.observer_error=None

    def launch(self):
        with self.lock:
            if self.thread and self.thread.is_alive():return
            self.store.acquire_lease()
            self.halt.clear();self.thread=threading.Thread(target=self._run,name="quote-evidence-recorder",daemon=True);self.thread.start()

    def _run(self):
        while not self.halt.is_set():
            try:self.poll_once()
            except Exception:
                with self.lock:self.state="EVIDENCE_STORAGE_ERROR";self.intent["enabled"]=False
            self.halt.wait(self.interval)

    def shutdown(self):
        self.halt.set()
        if self.thread:self.thread.join(timeout=15)
        if not self.thread or not self.thread.is_alive():self.store.release_lease()

    def start(self,symbol,launch=True):
        import re
        if not isinstance(symbol,str) or not re.fullmatch(r"[A-Za-z0-9_.#-]{3,64}",symbol):raise ValueError("INVALID_RECORDER_SYMBOL")
        with self.poll_lock,self.lock:
            sid=self.intent.get("source_id") if self.intent.get("symbol")==symbol and self.state!="SOURCE_CHANGED" else None
            self.intent={"enabled":True,"symbol":symbol,"source_id":sid};self.store.put("recorder",self.intent);self.store.event(sid,"RECORDER_START_REQUESTED");self.state="STARTING"
        if launch:self.launch()
        return self.status()

    def stop(self):
        with self.poll_lock,self.lock:
            self.intent={**self.intent,"enabled":False};self.store.put("recorder",self.intent);self.store.event(self.intent.get("source_id"),"RECORDER_STOP_REQUESTED");self.state="STOPPED"
        return self.status()

    def poll_once(self):
        if not self.poll_lock.acquire(blocking=False):return
        try:
            with self.lock:
                if not self.intent["enabled"]:return
                before=dict(self.intent)
            cursor=self.store.cursor(before["source_id"]) if before["source_id"] else (0,0)
            packet=self.provider(before["symbol"],cursor,self.store.get("salt"))
            state=packet.get("reason","SOURCE_UNAVAILABLE") if not packet.get("ok") else "CATCHING_UP" if packet.get("catching_up") else "RECORDING"
            with self.lock:
                self.last_poll=now_iso()
                if packet.get("ok"):
                    sid=packet["source"]["id"]
                    if before["source_id"] and sid!=before["source_id"]:state="SOURCE_CHANGED"
                    else:
                        try:
                            committed=self.store.append(packet);self.inserted+=committed["inserted"];self.duplicates+=committed["duplicates"]
                            if committed["inserted"]:self.last_commit=now_iso()
                            self.intent={**self.intent,"source_id":sid}
                            if self.on_commit:
                                try:self.on_commit(sid);self.observer_error=None
                                except Exception:self.observer_error="OBSERVER_PROCESSING_FAILED_RAW_COLLECTION_CONTINUES"
                        except ValueError as error:state=str(error)
                if state!=self.state:
                    self.store.event(before.get("source_id"),state)
                    if self.on_commit and before.get("source_id"):
                        try:self.on_commit(before["source_id"]);self.observer_error=None
                        except Exception:self.observer_error="OBSERVER_PROCESSING_FAILED_RAW_COLLECTION_CONTINUES"
                self.state=state
                if state in {"SOURCE_CHANGED","TICK_BACKLOG_OVERFLOW","SOURCE_CLOCK_REWIND"} or state.startswith(("EVIDENCE_","INVALID_")):
                    self.intent={**self.intent,"enabled":False};self.store.put("recorder",self.intent)
        finally:self.poll_lock.release()

    def status(self):
        with self.lock:
            return {**self.store.status(),**self.intent,"state":self.state,"last_poll":self.last_poll,"last_commit":self.last_commit,"process_inserted":self.inserted,"process_duplicates":self.duplicates,"observer_error":self.observer_error,"survives_browser_close":True,"resume_policy":"EXPLICIT_SAVED_INTENT_SAME_SOURCE_ONLY","trade_authority":"NONE"}
