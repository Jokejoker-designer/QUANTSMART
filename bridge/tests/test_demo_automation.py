import unittest, time
from types import SimpleNamespace
from bridge.demo_automation import DemoAutomation, AutoStart, AutoAction
from bridge.mt5_bridge import TerminalService, ConnectInput
from test_demo_execution import DemoSDK


class AutoTests(unittest.TestCase):
    def setUp(self):
        self.sdk = DemoSDK()
        self.terminal = TerminalService(self.sdk)
        self.terminal.connect(ConnectInput())
        self.runner = DemoAutomation(self.terminal, True)
        self.sdk.order_send = self.send
        self.sdk.orders_get = lambda: ()

    def send(self, request):
        self.sdk.sent.append(dict(request))
        if "position" in request:
            self.sdk.positions = []
        else:
            self.sdk.positions = [
                SimpleNamespace(
                    ticket=900,
                    symbol=request["symbol"],
                    type=request["type"],
                    volume=request["volume"],
                    magic=request["magic"],
                    price_open=100.02,
                    sl=request["sl"],
                    tp=request["tp"],
                    time=int(time.time()),
                )
            ]
        return SimpleNamespace(
            retcode=10009, order=900, deal=901, volume=request["volume"], price=100.02
        )

    def start(self):
        return self.runner.start(
            AutoStart(
                symbol="XAUUSD",
                definition_hash="a" * 64,
                volume=0.01,
                max_entries=1,
                confirm_demo=True,
            )
        )

    def action(self, session, kind="OPEN", identifier="b" * 64):
        return self.runner.execute(
            AutoAction(
                session_id=session["session_id"],
                action_id=identifier,
                kind=kind,
                side="BUY",
                sl=99,
                tp=104,
            )
        )

    def test_start_never_sends_and_defaults_off(self):
        self.assertTrue(self.start()["ok"])
        self.assertEqual(self.sdk.sent, [])
        self.assertFalse(
            DemoAutomation(self.terminal).start(
                AutoStart(
                    symbol="XAUUSD",
                    definition_hash="a" * 64,
                    volume=0.01,
                    max_entries=1,
                    confirm_demo=True,
                )
            )["ok"]
        )

    def test_owned_roundtrip_duplicate_and_entry_limit(self):
        session = self.start()
        self.assertEqual(self.action(session)["state"], "filled")
        self.assertEqual(self.action(session)["state"], "filled")
        self.assertEqual(len(self.sdk.sent), 1)
        self.assertEqual(
            self.runner.heartbeat(session["session_id"])["position"]["ticket"], "900"
        )
        self.assertEqual(self.action(session, "CLOSE", "c" * 64)["state"], "filled")
        self.assertEqual(self.sdk.sent[-1]["position"], 900)
        self.assertEqual(
            self.action(session, identifier="d" * 64)["reason"],
            "DEMO_ENTRY_LIMIT_REACHED",
        )
        self.assertEqual(len(self.sdk.sent), 2)

    def test_real_and_changed_accounts_never_send(self):
        session = self.start()
        self.sdk.account.trade_mode = 2
        self.assertFalse(self.action(session)["ok"])
        self.assertEqual(self.sdk.sent, [])
        self.sdk.account.trade_mode = 0
        session = self.start()
        self.sdk.account.login += 1
        self.assertFalse(self.action(session)["ok"])
        self.assertEqual(self.sdk.sent, [])

    def test_expired_lease_and_stopped_sessions_fail_closed(self):
        session = self.start()
        self.runner.session["heartbeat"] -= 13
        self.assertEqual(self.action(session)["reason"], "DEMO_RUNNER_LEASE_EXPIRED")
        self.assertEqual(self.sdk.sent, [])
        session = self.start()
        self.runner.stop()
        self.assertFalse(self.action(session)["ok"])
        self.assertEqual(self.sdk.sent, [])

    def test_external_position_conflict_and_unknown_result_stop(self):
        session = self.start()
        self.sdk.positions = [SimpleNamespace(ticket=12, magic=0)]
        self.assertFalse(self.action(session)["ok"])
        self.assertEqual(self.sdk.sent, [])
        self.sdk.positions = []
        session = self.start()
        self.sdk.order_send = lambda request: None
        self.assertEqual(self.action(session)["state"], "unknown")
        self.assertFalse(self.runner.session["active"])
        self.assertFalse(self.action(session, identifier="c" * 64)["ok"])

    def test_protective_levels_required(self):
        session = self.start()
        result = self.runner.execute(
            AutoAction(
                session_id=session["session_id"],
                action_id="b" * 64,
                kind="OPEN",
                sl=0,
                tp=0,
            )
        )
        self.assertFalse(result["ok"])
        self.assertEqual(self.sdk.sent, [])

    def test_unknown_or_empty_session_cannot_extend_lease(self):
        self.start()
        self.assertFalse(self.runner.heartbeat("")["ok"])
        self.assertEqual(self.sdk.sent, [])

    def test_broker_tick_grid_preserves_protective_direction(self):
        session = self.start()
        result = self.runner.execute(
            AutoAction(
                session_id=session["session_id"],
                action_id="b" * 64,
                kind="OPEN",
                sl=99.1234,
                tp=104.1234,
            )
        )
        self.assertEqual(result["state"], "filled")
        self.assertEqual(self.sdk.sent[-1]["sl"], 99.12)
        self.assertEqual(self.sdk.sent[-1]["tp"], 104.13)

    def test_pending_orders_prevent_start_and_reconciliation(self):
        self.sdk.orders_get = lambda: (SimpleNamespace(ticket=2),)
        self.assertFalse(self.start()["ok"])
        self.assertFalse(self.runner.reconcile()["ok"])
        self.assertEqual(self.sdk.sent, [])


    def test_done_retcode_with_missing_fill_is_unknown(self):
        session = self.start()
        self.sdk.order_send = lambda request: SimpleNamespace(retcode=10009, order=900, deal=0, volume=0, price=0)
        result = self.action(session)
        self.assertEqual(result["state"], "unknown")
        self.assertFalse(self.runner.session["active"])

if __name__ == "__main__":
    unittest.main()
