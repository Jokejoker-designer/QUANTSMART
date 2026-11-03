import tempfile
import unittest
from pathlib import Path

from bridge.tick_evidence import TickEvidenceStore, TickRecorder


def packet(start=1000, count=3, source="fixture-source"):
    ticks=[dict(raw_time_msc=start,source_ordinal=i+1,time_msc=start-100,bid=100+i,ask=101+i,last=0,flags=2,volume=0) for i in range(count)]
    return dict(ok=True,source=dict(id=source,canonical_symbol="XAUUSD",broker_symbol="GOLD",broker="Fixture",server_timezone="UTC",timestamp_contract="BROKER_WALL_TO_UTC_V1"),ticks=ticks,cursor=f"1:{start}:{count}",generation=1,received_at="2026-11-03T00:00:00Z",catching_up=False)


class TickEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.path=Path(self.tmp.name)/"ticks.sqlite3"
        self.store=TickEvidenceStore(self.path,max_rows=20)

    def tearDown(self):
        self.store.close()
        self.tmp.cleanup()

    def test_same_millisecond_retry_restart_and_exact_values(self):
        first=self.store.append(packet())
        self.assertEqual(first["inserted"],3)
        self.assertEqual(self.store.append(packet())["inserted"],0)
        before=self.store.replay("fixture-source",limit=100)["ticks"]
        self.assertEqual([r["source_ordinal"] for r in before],[1,2,3])
        self.store.close();self.store=TickEvidenceStore(self.path,max_rows=20)
        self.assertEqual(self.store.replay("fixture-source",limit=100)["ticks"],before)
        self.assertEqual(self.store.cursor("fixture-source"),(1000,3))
        self.assertEqual(self.store.integrity()["verified_rows"],3)

    def test_conflicting_retry_rolls_back_ticks_and_cursor(self):
        self.store.append(packet())
        conflict=packet();conflict["ticks"][1]["bid"]=100.75
        with self.assertRaisesRegex(ValueError,"CONFLICT"):
            self.store.append(conflict)
        self.assertEqual(self.store.cursor("fixture-source"),(1000,3))
        self.assertEqual(self.store.replay("fixture-source")["ticks"][1]["bid"],101)

    def test_bad_batch_no_partial_write_or_advance(self):
        bad=packet();bad["ticks"][2]["ask"]=0
        with self.assertRaises(ValueError):self.store.append(bad)
        self.assertEqual(self.store.cursor("fixture-source"),(0,0))
        self.assertEqual(self.store.status()["rows"],0)

    def test_quota_refuses_whole_batch_without_deleting_evidence(self):
        self.store.append(packet(count=19))
        with self.assertRaisesRegex(ValueError,"CAPACITY"):
            self.store.append(packet(start=2000,count=2))
        self.assertEqual(self.store.status()["rows"],19)
        self.assertEqual(self.store.cursor("fixture-source"),(1000,19))

    def test_source_isolation_same_timestamp_and_public_identity(self):
        self.store.append(packet(source="a"));self.store.append(packet(source="b"))
        self.assertEqual(self.store.status()["rows"],6)
        self.assertEqual(len(self.store.replay("a")["ticks"]),3)
        self.assertNotIn("login",str(self.store.status()))

    def test_corrupted_value_is_refused_on_read_and_integrity(self):
        self.store.append(packet())
        self.store.db.execute("UPDATE ticks SET bid=999 WHERE ordinal=1");self.store.db.commit()
        with self.assertRaisesRegex(ValueError,"INTEGRITY"):self.store.replay("fixture-source")
        with self.assertRaisesRegex(ValueError,"INTEGRITY"):self.store.integrity()

    def test_recorder_explicit_start_stop_and_source_change(self):
        calls=[]
        def provider(symbol,cursor,salt):
            calls.append((symbol,cursor))
            return packet(source="fixture-source" if len(calls)==1 else "other-source")
        recorder=TickRecorder(self.store,provider,interval=60)
        self.assertFalse(recorder.status()["enabled"])
        recorder.start("XAUUSD",launch=False);recorder.poll_once()
        self.assertEqual(self.store.status()["rows"],3)
        recorder.poll_once()
        self.assertEqual(recorder.status()["state"],"SOURCE_CHANGED")
        self.assertFalse(recorder.status()["enabled"])
        self.assertEqual(self.store.status()["rows"],3)
        recorder.stop();self.assertFalse(recorder.status()["enabled"])

    def test_transient_unavailable_does_not_invent_quotes(self):
        recorder=TickRecorder(self.store,lambda *_:dict(ok=False,reason="TERMINAL_DISCONNECTED"))
        recorder.start("XAUUSD",launch=False);recorder.poll_once()
        self.assertEqual(recorder.status()["state"],"TERMINAL_DISCONNECTED")
        self.assertTrue(recorder.status()["enabled"])
        self.assertEqual(self.store.status()["rows"],0)

    def test_enabled_intent_is_durable_but_not_an_order_session(self):
        recorder=TickRecorder(self.store,lambda *_:packet())
        recorder.start("XAUUSD",launch=False);recorder.poll_once()
        self.store.close();self.store=TickEvidenceStore(self.path,max_rows=20)
        restored=TickRecorder(self.store,lambda *_:packet())
        self.assertTrue(restored.status()["enabled"])
        self.assertEqual(restored.status()["source_id"],"fixture-source")
        self.assertFalse(restored.status()["live_apply_allowed"])

    def test_source_binding_commits_with_the_first_batch(self):
        self.store.put("recorder",dict(enabled=True,symbol="XAUUSD",source_id=None))
        self.store.append(packet())
        self.assertEqual(self.store.get("recorder")["source_id"],"fixture-source")

    def test_replay_pages_do_not_skip_same_millisecond_ordinals(self):
        self.store.append(packet(count=5))
        first=self.store.replay("fixture-source",limit=2)
        second=self.store.replay("fixture-source",limit=2,**first["next_cursor"])
        third=self.store.replay("fixture-source",limit=2,**second["next_cursor"])
        self.assertEqual([t["source_ordinal"] for page in (first,second,third) for t in page["ticks"]],[1,2,3,4,5])

    def test_only_one_recorder_can_own_the_database(self):
        self.store.acquire_lease()
        other=TickEvidenceStore(self.path,max_rows=20)
        try:
            with self.assertRaisesRegex(ValueError,"ALREADY_OWNED"):other.acquire_lease()
            self.store.release_lease();other.acquire_lease()
        finally:other.close()

    def test_cursor_and_source_metadata_corruption_are_refused(self):
        self.store.append(packet())
        self.store.db.execute("UPDATE sources SET raw_ms=9999");self.store.db.commit()
        with self.assertRaisesRegex(ValueError,"CURSOR_INTEGRITY"):self.store.cursor("fixture-source")
        self.store.db.execute("UPDATE sources SET raw_ms=1000,payload='{}'");self.store.db.commit()
        with self.assertRaisesRegex(ValueError,"SOURCE_INTEGRITY"):self.store.status()

    def test_real_http_bridge_routes_and_account_isolation(self):
        import time
        from types import SimpleNamespace
        from fastapi.testclient import TestClient
        from bridge.mt5_bridge import TerminalService,ConnectInput,create_app
        from bridge.tests.test_mt5_bridge import FakeSDK
        sdk=FakeSDK();service=TerminalService(sdk=sdk,platform="win32")
        service.connect(ConnectInput());raw=int(time.time()*1000)
        values=[dict(time=raw//1000,time_msc=raw,bid=100,ask=101,last=0,volume=0,flags=2)]
        sdk.COPY_TICKS_ALL=0;sdk.symbol_info_tick=lambda _:SimpleNamespace(**values[-1]);sdk.copy_ticks_from=lambda *_:values
        one=service.evidence_packet("XAUUSD",(0,0),"private-test-salt")
        sdk.account.login=54321
        two=service.evidence_packet("XAUUSD",(0,0),"private-test-salt")
        self.assertNotEqual(one["source"]["id"],two["source"]["id"])
        self.assertNotIn("54321",str(two["source"]))
        with TestClient(create_app(service,token="test",evidence_path=Path(self.tmp.name)/"http.sqlite3"),base_url="http://127.0.0.1") as client:
            headers={"X-MFE-Bridge-Token":"test"}
            self.assertEqual(client.get("/mt5/evidence/status").status_code,403)
            result=client.post("/mt5/evidence/start",headers=headers,json={"symbol":"XAUUSD"})
            self.assertEqual(result.status_code,200)
            for _ in range(100):
                status=client.get("/mt5/evidence/status",headers=headers).json()
                if status["rows"]:break
                time.sleep(.01)
            self.assertEqual(status["rows"],1)
            saved=client.get("/mt5/evidence/replay",headers=headers,params={"source_id":status["source_id"]}).json()
            self.assertEqual(saved["ticks"][0]["raw_time_msc"],raw)
            self.assertFalse(client.post("/mt5/evidence/stop",headers=headers,json={}).json()["enabled"])
            self.assertTrue(client.get("/mt5/evidence/integrity",headers=headers).json()["ok"])
            sdk.copy_ticks_range=lambda *_:values
            reconciled=client.get("/mt5/evidence/reconcile",headers=headers,params={"source_id":status["source_id"]}).json()
            self.assertTrue(reconciled["ok"]);self.assertEqual(reconciled["matched_rows"],1)
            observation=client.get("/mt5/evidence/observation",headers=headers).json()
            self.assertFalse(observation["live_eligible"])
            self.assertEqual(observation["source_id"],status["source_id"])
            empty=client.get("/mt5/evidence/observation?symbol=EURUSD",headers=headers).json()
            self.assertEqual(empty["freshness"]["state"],"NO_RECORDED_SOURCE")
            self.assertIsNone(empty["current"])
            self.assertEqual(client.post("/mt5/evidence/model/propose",headers=headers,json={"source_id":status["source_id"]}).status_code,409)
            self.assertEqual(client.post("/mt5/evidence/model/propose",headers=headers,json={"source_id":status["source_id"],"unexpected":"field"}).status_code,422)
            client.post("/mt5/evidence/start",headers=headers,json={"symbol":"XAUUSD"})
            client.post("/mt5/disconnect",headers=headers,json={})
            self.assertFalse(client.get("/mt5/evidence/status",headers=headers).json()["enabled"],"explicit detach must revoke recorder resume intent")


if __name__=="__main__":unittest.main()
