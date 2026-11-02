import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import patch
from bridge.broker_deals import read_demo_deals
from bridge.mt5_bridge import TerminalService, ConnectInput
from test_demo_execution import DemoSDK


class BrokerDealTests(unittest.TestCase):
    def setUp(self):
        class FrozenDateTime(datetime):
            @classmethod
            def now(cls, tz=None):
                return cls(2026, 11, 3, tzinfo=timezone.utc)

        frozen = patch("bridge.broker_deals.datetime", FrozenDateTime)
        frozen.start()
        self.addCleanup(frozen.stop)
        self.sdk = DemoSDK()
        self.terminal = TerminalService(self.sdk, server_timezone="Etc/GMT-2")
        self.terminal.connect(ConnectInput())
        self.symbol = self.terminal.resolve("XAUUSD")["broker_symbol"]
        self.when = int(datetime(2026, 11, 2, 0, 0, tzinfo=timezone.utc).timestamp())
        self.rows = [self.deal(1, 0, 0), self.deal(2, 1, 1)]
        self.sdk.history_deals_get = lambda *args: self.rows

    def deal(self, ticket, side, entry):
        return SimpleNamespace(
            ticket=ticket,
            order=ticket + 100,
            position_id=10,
            symbol=self.symbol,
            type=side,
            entry=entry,
            time=self.when + 7200,
            time_msc=(self.when + 7200) * 1000 + ticket,
            price=100 + ticket / 10,
            volume=0.03,
        )

    def read(self, **kwargs):
        return read_demo_deals(
            self.terminal,
            "XAUUSD",
            "2026-11-01T23:00:00Z",
            "2026-11-02T01:00:00Z",
            **kwargs
        )

    def test_entry_exit_are_distinct_and_time_is_normalized(self):
        result = self.read()
        self.assertTrue(result["ok"])
        a, b = result["deals"]
        self.assertEqual(a["timeMs"], self.when * 1000 + 1)
        self.assertEqual(a["entryKind"], "ENTRY")
        self.assertEqual(b["entryKind"], "EXIT")
        self.assertEqual(b["side"], "SELL")
        self.assertEqual(b["positionSide"], "BUY")
        self.assertEqual(a["positionId"], b["positionId"])
        self.assertEqual(self.sdk.sent, [])

    def test_duplicates_are_deduplicated_and_other_symbols_excluded(self):
        other = self.deal(3, 0, 0)
        other.symbol = "EURUSD"
        self.rows.extend([self.rows[0], other])
        self.assertEqual(len(self.read()["deals"]), 2)

    def test_missing_history_is_not_empty_success(self):
        self.sdk.history_deals_get = lambda *args: None
        self.assertFalse(self.read()["ok"])

    def test_real_accounts_are_refused(self):
        self.sdk.account.trade_mode = 2
        self.assertFalse(self.read()["ok"])
        self.assertEqual(self.sdk.sent, [])

    def test_account_change_during_read_is_refused(self):
        def changed(*args):
            self.sdk.account.login += 1
            return self.rows

        self.sdk.history_deals_get = changed
        self.assertEqual(self.read()["reason"], "DEMO_ACCOUNT_CHANGED")

    def test_partial_history_does_not_invent_position_direction(self):
        self.rows = self.rows[1:]
        self.assertIsNone(self.read()["deals"][0]["positionSide"])

    def test_window_and_limit_are_bounded(self):
        self.assertFalse(self.read(limit=2001)["ok"])
        self.assertFalse(
            read_demo_deals(
                self.terminal, "XAUUSD", "2020-01-01T00:00:00Z", "2026-01-01T00:00:00Z"
            )["ok"]
        )


if __name__ == "__main__":
    unittest.main()
