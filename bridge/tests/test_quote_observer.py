import tempfile
import unittest
from datetime import datetime,timezone
from unittest.mock import patch
from pathlib import Path
from bridge.tick_evidence import TickEvidenceStore
from bridge.quote_observer import QuoteObserver,compare_recorded_windows,window_features,WINDOW,HORIZON


def quote(at,bid=100,spread=1):
    return dict(raw_time_msc=at,source_ordinal=1,time_msc=at,bid=float(bid),ask=float(bid+spread),last=0.,flags=2,volume=0.)


class QuoteObserverTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.store=TickEvidenceStore(Path(self.temp.name)/"ticks.sqlite3",max_rows=10000)
        self.observer=QuoteObserver(self.store)
        self.source={"id":"source","canonical_symbol":"XAUUSD","broker_symbol":"GOLD","server_timezone":"UTC"}
    def tearDown(self):self.store.close();self.temp.cleanup()
    def append_minutes(self,start,end,spread=1):
        rows=[quote(at,100+(at//1000%10)/100,spread) for at in range(start*WINDOW,end*WINDOW,1000)]
        for i in range(0,len(rows),1000):self.store.append(dict(ok=True,source=self.source,ticks=rows[i:i+1000]))
        for _ in range(10):self.observer.advance("source")

    def test_feature_cutoff_never_reads_future(self):
        rows=[quote(at,100+at/100000) for at in range(0,2*WINDOW,1000)]
        before=window_features(rows,WINDOW)
        for row in rows[60:]:row["ask"]=999999
        self.assertEqual(window_features(rows,WINDOW),before)
        self.assertEqual(before["features"]["spread_p50"],1)
        self.assertEqual(before["features"]["tick_rate_per_second"],1)
        self.assertIsNone(window_features(rows[:10],WINDOW)["features"])

    def test_analog_and_median_comparison_exclude_future_and_other_session(self):
        self.append_minutes(0, 35)
        snapshot = self.observer.snapshot("source", include_comparison=True)
        comparison = snapshot["comparison"]
        self.assertEqual(comparison["eligible_windows"], 33)
        self.assertLess(comparison["earlier_to_ms"], comparison["recent_from_ms"])
        self.assertTrue(all(row["cutoff_ms"] < comparison["query_cutoff_ms"] for row in comparison["matches"]))
        current = snapshot["current"]
        history = [self.observer._read(*row) for row in self.store.db.execute(
            "SELECT payload,hash FROM quote_windows WHERE source=?", ("source",)
        )]
        incompatible = {**current, "cutoff_ms": 1, "session": "OTHER_SESSION"}
        future = {**current, "cutoff_ms": current["cutoff_ms"] + WINDOW}
        self.assertEqual(compare_recorded_windows(current, history + [incompatible, future]), comparison)
        self.assertIsNone(self.observer.snapshot("other", include_comparison=True)["comparison"])

    def test_frozen_declaration_pending_resolution_and_restart(self):
        self.append_minutes(0,36)
        snapshot=self.observer.snapshot("source")
        self.assertEqual(snapshot["state"],"DESCRIPTIVE_ONLY")
        self.assertEqual(snapshot["declarations"][0]["outcome"],"PENDING")
        frozen=snapshot["declarations"][0]["declaration"]
        self.append_minutes(36,42,spread=3)
        after=self.observer.snapshot("source")
        row=next(r for r in after["declarations"] if r["declaration"]["cutoff_ms"]==frozen["cutoff_ms"])
        self.assertEqual(row["declaration"],frozen)
        self.assertEqual(row["outcome"],"EVENT_OBSERVED")
        self.assertFalse(after["live_eligible"])
        self.assertEqual(after["predictive_calibration"],"NOT_QUALIFIED_NO_LOCKED_INDEPENDENT_HOLDOUT")
        self.assertEqual(QuoteObserver(self.store).snapshot("source")["declarations"],after["declarations"])

    def test_negative_control_no_event_not_unknown(self):
        self.append_minutes(0,45)
        rows=self.observer.snapshot("source")["declarations"]
        self.assertTrue(any(r["outcome"]=="VERIFIED_NEGATIVE" for r in rows))
        self.assertTrue(any(r["outcome"]=="PENDING" for r in rows))
        self.assertTrue(all(r["resolution"] is None for r in rows if r["outcome"]=="PENDING"))

    def test_source_isolation_and_model_version_review_rollback(self):
        self.append_minutes(0,40)
        self.assertIsNone(self.observer.snapshot("other")["current"])
        with self.assertRaisesRegex(ValueError,"INSUFFICIENT"):self.observer.propose("other")
        one=self.observer.propose("source");two=self.observer.propose("source")
        self.assertEqual((one["version"],two["version"]),(1,2))
        self.observer.review("source",two["id"],"Fixture operator","SELECT_DESCRIPTIVE")
        result=self.observer.review("source",one["id"],"Fixture operator","ROLLBACK_DESCRIPTIVE")
        self.assertEqual(result["active_descriptive_version"],one["id"])
        self.assertFalse(result["applies_to_strategies"])
        self.observer.review("source",two["id"],"Fixture","QUARANTINE_DESCRIPTIVE")
        self.assertEqual(self.observer.snapshot("source")["active_descriptive_version"],one["id"])
        with self.assertRaisesRegex(ValueError,"QUARANTINED"):self.observer.review("source",two["id"],"Fixture","SELECT_DESCRIPTIVE")
        with self.assertRaisesRegex(ValueError,"SOURCE"):self.observer.review("other",one["id"],"Fixture","SELECT_DESCRIPTIVE")
        self.store.db.execute("UPDATE quote_windows SET payload='{}'");self.store.db.commit()
        with self.assertRaisesRegex(ValueError,"INTEGRITY"):self.observer.snapshot("source")

    def test_warning_false_alarm_and_future_gap_are_distinct(self):
        self.append_minutes(0,34);self.append_minutes(34,35,spread=2);self.append_minutes(35,41)
        snap=self.observer.snapshot("source")
        warning=next(r for r in snap["declarations"] if r["declaration"]["cutoff_ms"]==35*WINDOW)
        self.assertEqual(warning["declaration"]["kind"],"WARNING")
        self.assertEqual(warning["outcome"],"NO_EVENT")
        self.assertEqual(warning["declaration"]["evaluation_mode"],"HISTORICAL_REPLAY")
        self.assertIsNone(snap["false_alarm_rate"],"Retrospective replay must not inflate prospective warning statistics")
        self.append_minutes(45,46)
        self.assertTrue(any(r["outcome"]=="UNKNOWN" for r in self.observer.snapshot("source")["declarations"]))

    def test_source_rejection_resolves_even_without_more_quotes(self):
        self.append_minutes(0,36)
        at=datetime.fromtimestamp(36*60,timezone.utc).isoformat()
        self.store.db.execute("INSERT INTO quality(at,source,state,detail) VALUES(?,?,?,?)",(at,"source","SOURCE_CHANGED","{}"));self.store.db.commit()
        self.observer.advance("source")
        self.assertEqual(self.observer.snapshot("source")["declarations"][0]["outcome"],"INVALID_SOURCE")

    def test_prospective_horizon_starts_after_actual_publication(self):
        class Clock(datetime):
            @classmethod
            def now(cls,tz=None):return cls.fromtimestamp(35*60+2,tz=timezone.utc)
        self.append_minutes(0,34)
        with patch("bridge.quote_observer.datetime",Clock):self.append_minutes(34,36)
        declaration=self.observer.snapshot("source")["declarations"][0]["declaration"]
        self.assertEqual(declaration["evaluation_mode"],"LIVE_PROSPECTIVE")
        self.assertEqual(declaration["decision_time_ms"],35*WINDOW+2000)
        self.assertLess(declaration["cutoff_ms"],declaration["decision_time_ms"])

    def test_corrupted_future_tick_cannot_resolve_an_outcome(self):
        self.append_minutes(0,36)
        rows=[quote(at) for at in range(36*WINDOW,41*WINDOW,1000)]
        self.store.append(dict(ok=True,source=self.source,ticks=rows))
        self.store.db.execute("UPDATE ticks SET ask=999 WHERE utc_ms=?",(36*WINDOW,));self.store.db.commit()
        with self.assertRaisesRegex(ValueError,"INTEGRITY"):self.observer.advance("source")


if __name__=="__main__":unittest.main()
