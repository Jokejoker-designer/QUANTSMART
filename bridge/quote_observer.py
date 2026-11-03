"""Causal recorded-quote statistics and prospective observation evidence, never orders."""
from __future__ import annotations
import json
import math
import hashlib
from pathlib import Path
from datetime import datetime,timezone

if __package__:
    from .tick_evidence import canonical,digest,now_iso,AUTHORITY
else:
    from tick_evidence import canonical,digest,now_iso,AUTHORITY

VERSION="QUOTE_WINDOWS_V1"
WINDOW=60000
HORIZON=300000
CODE_SHA256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
CONFIG={"window_ms":WINDOW,"horizon_ms":HORIZON,"minimum_quotes":30,"minimum_span_ms":45000,"maximum_gap_ms":30000,"baseline_windows":30,"baseline_lookback_windows":180,"target_multiplier":1.5,"partition":"SOURCE_AND_UTC_SESSION","design_origin":"NEW_EXPERIMENTAL_DESCRIPTIVE_CHOICES_NOT_RECOVERED_CONSTANTS"}
CONFIG_SHA256=digest(CONFIG)


def quantile(values,q):
    ordered=sorted(values)
    if not ordered:return None
    position=(len(ordered)-1)*q;lo=math.floor(position);hi=math.ceil(position)
    return ordered[lo]+(ordered[hi]-ordered[lo])*(position-lo)


def window_features(ticks,cutoff):
    rows=[t for t in ticks if cutoff-WINDOW<=t["time_msc"]<cutoff]
    base={"cutoff_ms":cutoff,"window_ms":WINDOW,"quotes":len(rows),"feature_version":VERSION,"session":"UTC_ASIA" if datetime.fromtimestamp(cutoff/1000,timezone.utc).hour<7 else "UTC_EUROPE" if datetime.fromtimestamp(cutoff/1000,timezone.utc).hour<13 else "UTC_US" if datetime.fromtimestamp(cutoff/1000,timezone.utc).hour<22 else "UTC_LATE"}
    if len(rows)<30:return {**base,"quality":"INSUFFICIENT_SAMPLE","features":None}
    times=[t["time_msc"] for t in rows];intervals=[b-a for a,b in zip(times,times[1:])]
    if times[-1]-times[0]<45000 or max(intervals,default=0)>30000:return {**base,"quality":"UNKNOWN_COVERAGE","features":None}
    spreads=[t["ask"]-t["bid"] for t in rows];mid=[(t["ask"]+t["bid"])/2 for t in rows]
    travel=sum(abs(b-a) for a,b in zip(mid,mid[1:]));progress=abs(mid[-1]-mid[0])
    return {**base,"quality":"OBSERVED_WINDOW","features":{"tick_rate_per_second":len(rows)/60,"interarrival_p50_ms":quantile(intervals,.5),"interarrival_p95_ms":quantile(intervals,.95),"spread_p50":quantile(spreads,.5),"spread_p95":quantile(spreads,.95),"spread_max":max(spreads),"mid_range":max(mid)-min(mid),"price_progress_ratio":progress/travel if travel>0 else None,"source_kind":"MT5_QUOTE_UPDATES_NOT_EXCHANGE_ORDER_FLOW"}}


COMPARISON_FEATURES = ("tick_rate_per_second", "interarrival_p95_ms", "spread_p95", "mid_range")


def compare_recorded_windows(current, history):
    """Rank earlier windows from the same source/session using empirical ranks."""
    if not current or not current.get("features"):
        return None
    eligible = sorted((
        row for row in history
        if row.get("features")
        and row["cutoff_ms"] < current["cutoff_ms"]
        and row["session"] == current["session"]
        and row["feature_version"] == current["feature_version"]
        and row.get("config_sha256") == current.get("config_sha256")
    ), key=lambda row: row["cutoff_ms"], reverse=True)
    if len(eligible) < 30:
        return None

    def rank(value, population):
        return sum((item < value) + 0.5 * (item == value) for item in population) / len(population)

    populations = {
        key: [row["features"][key] for row in eligible]
        for key in COMPARISON_FEATURES
    }
    current_ranks = {
        key: rank(current["features"][key], values)
        for key, values in populations.items()
    }
    # Use disjoint observations for the early and recent descriptive comparison.
    recent = eligible[:15]
    earlier = eligible[15:30]
    shifts = [{
        "feature": key,
        "earlier_median": quantile([row["features"][key] for row in earlier], .5),
        "recent_median": quantile([row["features"][key] for row in recent], .5),
    } for key in COMPARISON_FEATURES]
    matches = []
    for row in eligible:
        distance = sum(
            abs(rank(row["features"][key], populations[key]) - current_ranks[key])
            for key in COMPARISON_FEATURES
        ) / len(COMPARISON_FEATURES)
        matches.append({"cutoff_ms": row["cutoff_ms"], "rank_distance": distance})
    matches.sort(key=lambda row: (row["rank_distance"], -row["cutoff_ms"]))
    return {
        "query_cutoff_ms": current["cutoff_ms"],
        "eligible_windows": len(eligible),
        "matches": matches[:5],
        "earlier_to_ms": earlier[0]["cutoff_ms"],
        "recent_from_ms": recent[-1]["cutoff_ms"],
        "windows_per_group": 15,
        "median_shifts": shifts,
    }


class QuoteObserver:
    def __init__(self,store):
        self.store=store
        with store.lock,store.db:
            store.db.executescript("""
              CREATE TABLE IF NOT EXISTS quote_windows(source TEXT NOT NULL,cutoff INTEGER NOT NULL,payload TEXT NOT NULL,hash TEXT NOT NULL,PRIMARY KEY(source,cutoff));
              CREATE TABLE IF NOT EXISTS quote_declarations(id TEXT PRIMARY KEY,source TEXT NOT NULL,cutoff INTEGER NOT NULL,horizon INTEGER NOT NULL,kind TEXT NOT NULL,payload TEXT NOT NULL,hash TEXT NOT NULL,outcome TEXT NOT NULL DEFAULT 'PENDING',resolution TEXT);
              CREATE TABLE IF NOT EXISTS quote_models(id TEXT PRIMARY KEY,source TEXT NOT NULL,payload TEXT NOT NULL,hash TEXT NOT NULL);
              CREATE TABLE IF NOT EXISTS quote_reviews(id INTEGER PRIMARY KEY,source TEXT NOT NULL,at TEXT NOT NULL,action TEXT NOT NULL,model TEXT,reviewer TEXT NOT NULL);
            """)
            if "resolution_hash" not in {row[1] for row in store.db.execute("PRAGMA table_info(quote_declarations)")}:
                store.db.execute("ALTER TABLE quote_declarations ADD COLUMN resolution_hash TEXT")

    def _read(self,text,h):
        value=json.loads(text)
        if digest(value)!=h:raise ValueError("OBSERVER_ARTIFACT_INTEGRITY")
        return value

    def advance(self,source):
        with self.store.lock,self.store.db:
            span=self.store.db.execute("SELECT min(utc_ms),max(utc_ms) FROM ticks WHERE source=?",(source,)).fetchone()
            if span[0] is None:return
            latest=span[1]//WINDOW*WINDOW
            previous=self.store.db.execute("SELECT max(cutoff) FROM quote_windows WHERE source=?",(source,)).fetchone()[0]
            start=previous+WINDOW if previous is not None else span[0]//WINDOW*WINDOW+WINDOW
            if self.store.db.execute("SELECT count(*) FROM quote_windows").fetchone()[0]>=10000:raise ValueError("OBSERVER_WINDOW_CAPACITY")
            for cutoff in range(start,min(latest,start+20*WINDOW)+1,WINDOW):
                values=self.store.db.execute("SELECT raw_ms,ordinal,utc_ms,bid,ask,last,flags,volume,hash FROM ticks WHERE source=? AND utc_ms>=? AND utc_ms<? ORDER BY utc_ms,raw_ms,ordinal LIMIT 20001",(source,cutoff-WINDOW,cutoff)).fetchall()
                ticks=[]
                for row in values:
                    value=self.store.tick_payload(row)
                    if digest(value)!=row[8]:raise ValueError("EVIDENCE_TICK_INTEGRITY")
                    ticks.append(value)
                result=window_features(ticks,cutoff) if len(values)<=20000 else {"cutoff_ms":cutoff,"quotes":len(values),"quality":"EXCESSIVE_WINDOW","features":None,"feature_version":VERSION}
                result.update({"calculation_code_sha256":CODE_SHA256,"config_sha256":CONFIG_SHA256})
                self.store.db.execute("INSERT INTO quote_windows VALUES(?,?,?,?)",(source,cutoff,canonical(result),digest(result)))
                # Baseline ends strictly before the declaration cutoff, same source and UTC session.
                prior=[self._read(*r) for r in self.store.db.execute("SELECT payload,hash FROM quote_windows WHERE source=? AND cutoff<? ORDER BY cutoff DESC LIMIT 180",(source,cutoff))]
                eligible=[r for r in prior if r.get("quality")=="OBSERVED_WINDOW" and r.get("session")==result.get("session") and r.get("feature_version")==result.get("feature_version") and r.get("config_sha256")==result.get("config_sha256")]
                if result.get("features") and len(eligible)>=30 and cutoff%HORIZON==0:
                    if self.store.db.execute("SELECT count(*) FROM quote_declarations").fetchone()[0]>=2000:raise ValueError("DECLARATION_CAPACITY_REACHED")
                    spread_threshold=quantile([r["features"]["spread_p95"] for r in eligible],.95)
                    range_threshold=quantile([r["features"]["mid_range"] for r in eligible],.95)
                    current=result["features"]
                    flags=[]
                    if spread_threshold and current["spread_p95"]>spread_threshold:flags.append("SPREAD_WIDENING")
                    if range_threshold and current["mid_range"]>range_threshold:flags.append("PRICE_RANGE_EXPANSION")
                    declared={"source_id":source,"cutoff_ms":cutoff,"horizon_ms":HORIZON,"kind":"WARNING" if flags else "NEGATIVE_CONTROL","flags":flags,"features":current,"feature_version":VERSION,"baseline_windows":len(eligible),"target":{"spread_threshold":spread_threshold*1.5 if spread_threshold else None,"range_threshold":range_threshold*1.5 if range_threshold else None},"authority":"SHADOW_ONLY","live_apply_allowed":False,"probability":None,"target_definition":"Any future quote spread or future mid-range exceeds the frozen 1.5x prior-window p95 threshold. This is an experimental descriptive target, not a validated BlackSwan forecast."}
                    issued=datetime.now(timezone.utc)
                    issued_ms=int(issued.timestamp()*1000)
                    prospective=0<=issued_ms-cutoff<=90000
                    declared.update({"issued_at":issued.isoformat(),"evaluation_mode":"LIVE_PROSPECTIVE" if prospective else "HISTORICAL_REPLAY","decision_time_ms":issued_ms if prospective else cutoff})
                    key="decl_"+digest(declared)
                    self.store.db.execute("INSERT OR IGNORE INTO quote_declarations VALUES(?,?,?,?,?,?,?,?,?,?)",(key,source,cutoff,HORIZON,declared["kind"],canonical(declared),digest(declared),"PENDING",None,None))
            pending=self.store.db.execute("SELECT id,payload,hash FROM quote_declarations WHERE source=? AND outcome='PENDING' ORDER BY cutoff LIMIT 100",(source,)).fetchall()
            for key,text,h in pending:
                declaration=self._read(text,h);cutoff=declaration.get("decision_time_ms",declaration["cutoff_ms"]);end=cutoff+declaration["horizon_ms"]
                # A rejected source contract cannot become a negative market observation.
                invalid=[]
                for at,state in self.store.db.execute("SELECT at,state FROM quality WHERE source=?",(source,)):
                    if state in {"SOURCE_CHANGED","SOURCE_CLOCK_REWIND","EVIDENCE_SOURCE_CONFLICT","EVIDENCE_TICK_CONFLICT","EVIDENCE_CURSOR_REWIND","EVIDENCE_UTC_TIME_REWIND","INVALID_EVIDENCE_QUOTE","INVALID_EVIDENCE_SOURCE"}:
                        when=int(datetime.fromisoformat(at.replace("Z","+00:00")).timestamp()*1000)
                        if cutoff<=when<=end:invalid.append(state)
                if span[1]<end and not invalid:continue
                futures = []
                if not invalid:
                    rows = self.store.db.execute(
                        "SELECT raw_ms,ordinal,utc_ms,bid,ask,last,flags,volume,hash FROM ticks "
                        "WHERE source=? AND utc_ms>=? AND utc_ms<? ORDER BY utc_ms,raw_ms,ordinal LIMIT 100001",
                        (source,cutoff,end),
                    )
                    for row in rows:
                        if digest(self.store.tick_payload(row)) != row[8]:
                            raise ValueError("EVIDENCE_TICK_INTEGRITY")
                        futures.append((row[2],row[3],row[4]))
                times=[r[0] for r in futures]
                gaps=[b-a for a,b in zip([cutoff]+times,times+[end])]
                if invalid:
                    outcome="INVALID_SOURCE";resolution={"reason":"SOURCE_CONTRACT_REJECTED_DURING_HORIZON","states":sorted(set(invalid)),"event":None}
                elif len(futures)<30 or len(futures)>100000 or max(gaps,default=HORIZON)>30000:
                    outcome="UNKNOWN";resolution={"reason":"INSUFFICIENT_OR_GAPPED_FUTURE_QUOTES","event":None}
                else:
                    spreads=[r[2]-r[1] for r in futures];mid=[(r[2]+r[1])/2 for r in futures];target=declaration["target"]
                    observed=bool(target["spread_threshold"] is not None and max(spreads)>target["spread_threshold"] or target["range_threshold"] is not None and max(mid)-min(mid)>target["range_threshold"])
                    outcome="EVENT_OBSERVED" if observed else "NO_EVENT" if declaration["kind"]=="WARNING" else "VERIFIED_NEGATIVE"
                    resolution={"event":observed,"future_quotes":len(futures),"future_to_ms":end,"resolved_with_source_cutoff_ms":span[1],"max_spread":max(spreads),"mid_range":max(mid)-min(mid),"mode":"DESCRIPTIVE_FORWARD_OBSERVATION_NOT_BROKER_EXECUTION"}
                self.store.db.execute("UPDATE quote_declarations SET outcome=?,resolution=?,resolution_hash=? WHERE id=?",(outcome,canonical(resolution),digest({"outcome":outcome,"resolution":resolution}),key))

    def snapshot(self,source=None,include_comparison=False):
        with self.store.lock:
            sources=self.store.status()["sources"]
            sid=source if source is not None else self.store.get("recorder",{}).get("source_id")
            row=self.store.db.execute("SELECT payload,hash FROM quote_windows WHERE source=? ORDER BY cutoff DESC LIMIT 1",(sid,)).fetchone()
            current=self._read(*row) if row else None
            prior=[self._read(*r) for r in self.store.db.execute("SELECT payload,hash FROM quote_windows WHERE source=? ORDER BY cutoff DESC LIMIT 181",(sid,))]
            valid = [
                row for row in prior
                if current and row["cutoff_ms"] < current["cutoff_ms"]
                and row.get("features")
                and row.get("session") == current.get("session")
                and row.get("feature_version") == current.get("feature_version")
                and row.get("config_sha256") == current.get("config_sha256")
            ]
            declarations=[]
            warning_counts={}
            for index,(key,text,h,outcome,resolution,resolution_hash) in enumerate(self.store.db.execute("SELECT id,payload,hash,outcome,resolution,resolution_hash FROM quote_declarations WHERE source=? ORDER BY cutoff DESC",(sid,))):
                if outcome!="PENDING" and digest({"outcome":outcome,"resolution":json.loads(resolution) if resolution else None})!=resolution_hash:raise ValueError("OBSERVER_RESOLUTION_INTEGRITY")
                value=self._read(text,h)
                if value["kind"]=="WARNING" and value.get("evaluation_mode")=="LIVE_PROSPECTIVE":warning_counts[outcome]=warning_counts.get(outcome,0)+1
                if index<100:declarations.append({"id":key,"declaration":value,"outcome":outcome,"resolution":json.loads(resolution) if resolution else None})
            counts=dict(self.store.db.execute("SELECT outcome,count(*) FROM quote_declarations WHERE source=? GROUP BY outcome",(sid,)).fetchall())
            resolved_warnings=warning_counts.get("EVENT_OBSERVED",0)+warning_counts.get("NO_EVENT",0)
            models=[]
            for key,text,h in self.store.db.execute("SELECT id,payload,hash FROM quote_models WHERE source=? ORDER BY rowid DESC LIMIT 20",(sid,)):
                review=self.store.db.execute("SELECT action FROM quote_reviews WHERE source=? AND model=? ORDER BY id DESC LIMIT 1",(sid,key)).fetchone()
                models.append({"id":key,**self._read(text,h),"review_state":"QUARANTINED" if review and review[0]=="QUARANTINE_DESCRIPTIVE" else "DESCRIPTIVE_ONLY"})
            active=self.store.get("observer_active_"+str(sid))
            selected=next((s for s in sources if s["id"]==sid),None)
            latest_ms=selected.get("to_ms") if selected else None
            age_ms=int(datetime.now(timezone.utc).timestamp()*1000)-latest_ms if latest_ms is not None else None
            freshness={"last_recorded_utc_ms":latest_ms,"age_ms":age_ms,"state":"NO_RECORDED_SOURCE" if age_ms is None else "CLOCK_AHEAD" if age_ms<0 else "RECENT_RECORDED_QUOTES" if age_ms<=30000 else "STALE_OR_QUIET_UNVERIFIED"}
            evidence_state=current["quality"] if current and not current.get("features") else "INSUFFICIENT_SAMPLE" if len(valid)<30 else "DESCRIPTIVE_ONLY"
            return {"ok":True,"source_id":sid,"sources":sources,"current":current,"state":evidence_state,"freshness":freshness,"comparison":compare_recorded_windows(current,prior) if include_comparison else None,"baseline_windows":len(valid),"historical_windows":len(prior),"memory_kind":"RECORDED_QUOTE_WINDOWS_NOT_LEARNED_TRADING_MEMORY","declarations":declarations,"outcome_counts":counts,"false_alarm_rate":warning_counts.get("NO_EVENT",0)/resolved_warnings if resolved_warnings else None,"resolved_warning_count":resolved_warnings,"models":models,"active_descriptive_version":active,"certification":"UNCERTIFIED","predictive_calibration":"NOT_QUALIFIED_NO_LOCKED_INDEPENDENT_HOLDOUT","live_eligible":False,"optional_module_inputs":"LOCKED_UNTIL_SOURCE_AND_PREDICTIVE_VALIDATION","pipeline":[{"stage":"live_tick_ingest","status":"OK" if sid else "INSUFFICIENT_SAMPLE"},{"stage":"quality_era_leakage_gate","status":"INSUFFICIENT_SAMPLE"},{"stage":"normalized_features","status":"BLOCKED_UPSTREAM"},{"stage":"role_evidence_validation","status":"NOT_IMPLEMENTED"},{"stage":"forecast_map","status":"OK" if declarations else "INSUFFICIENT_SAMPLE"},{"stage":"outcome_join","status":"OK" if any(k!='PENDING' for k in counts) else "INSUFFICIENT_SAMPLE"},{"stage":"calibration","status":"BLOCKED_UPSTREAM"},{"stage":"walk_forward_oos","status":"NOT_IMPLEMENTED"},{"stage":"memory_write","status":"BLOCKED_UPSTREAM"},{"stage":"shadow_observation","status":"OK" if sid else "INSUFFICIENT_SAMPLE"},{"stage":"manager_promotion_review","status":"NEEDS_MANAGER"}],"limitations":["Statistics describe recorded quote updates, not exchange flow or a calibrated probability.","Experimental forward targets and controls are source-specific; no independent holdout or predictive promotion is claimed.","Unknown outcomes remain unknown. Collection time alone never unlocks a coefficient or module input."],**AUTHORITY}

    def propose(self,source):
        snapshot=self.snapshot(source)
        if snapshot["baseline_windows"]<30:raise ValueError("INSUFFICIENT_SAMPLE_AT_LEAST_30_VALID_SAME_SESSION_WINDOWS")
        if not snapshot["current"] or not snapshot["current"].get("features"):raise ValueError("CURRENT_SOURCE_WINDOW_NOT_VALID")
        with self.store.lock,self.store.db:
            count=self.store.db.execute("SELECT count(*) FROM quote_models WHERE source=?",(source,)).fetchone()[0]
            if count>=1000:raise ValueError("MODEL_CAPACITY_REACHED")
            artifact={"version":1+count,"created_at":now_iso(),"source_id":source,"feature_version":VERSION,"calculation_code_sha256":CODE_SHA256,"config_sha256":CONFIG_SHA256,"config":CONFIG,"cutoff_ms":snapshot["current"]["cutoff_ms"],"tier":"UNCERTIFIED","status":"SHADOW","role":"DESCRIPTIVE_DATA_PROFILE_ONLY","baseline_windows":snapshot["baseline_windows"],"current_features":snapshot["current"]["features"],"predictive_qualified":False,"live_apply_allowed":False}
            key="model_"+digest(artifact)
            self.store.db.execute("INSERT INTO quote_models VALUES(?,?,?,?)",(key,source,canonical(artifact),digest(artifact)))
        return {"ok":True,"id":key,**artifact}

    def review(self,source,model,reviewer,action):
        if action not in {"SELECT_DESCRIPTIVE","ROLLBACK_DESCRIPTIVE","QUARANTINE_DESCRIPTIVE"} or not isinstance(reviewer,str) or not reviewer.strip() or len(reviewer)>80:raise ValueError("INVALID_OBSERVER_REVIEW")
        with self.store.lock,self.store.db:
            if self.store.db.execute("SELECT count(*) FROM quote_reviews").fetchone()[0]>=10000:raise ValueError("REVIEW_AUDIT_CAPACITY_REACHED")
            row=self.store.db.execute("SELECT payload,hash FROM quote_models WHERE id=? AND source=?",(model,source)).fetchone()
            if not row:raise ValueError("MODEL_SOURCE_MISMATCH")
            self._read(*row)
            last=self.store.db.execute("SELECT action FROM quote_reviews WHERE source=? AND model=? ORDER BY id DESC LIMIT 1",(source,model)).fetchone()
            if action!="QUARANTINE_DESCRIPTIVE" and last and last[0]=="QUARANTINE_DESCRIPTIVE":raise ValueError("MODEL_QUARANTINED_CREATE_NEW_VERSION")
            self.store.db.execute("INSERT INTO quote_reviews(source,at,action,model,reviewer) VALUES(?,?,?,?,?)",(source,now_iso(),action,model,reviewer.strip()))
            active=self.store.get("observer_active_"+source) if action=="QUARANTINE_DESCRIPTIVE" else model
            if action=="QUARANTINE_DESCRIPTIVE" and active==model:active=None
            self.store.db.execute("INSERT OR REPLACE INTO meta VALUES(?,?)",("observer_active_"+source,canonical(active)))
        return {"ok":True,"active_descriptive_version":active,"applies_to_strategies":False,"live_apply_allowed":False,"review_identity":"LOCAL_OPERATOR_DECLARATION_NOT_EXTERNAL_AUTHENTICATION"}
