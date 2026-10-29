"""Isolated SDK fixtures. These are unit tests, never production fallback data."""
import json
import os
import tempfile
import time
import unittest
from pathlib import Path
from types import SimpleNamespace
from fastapi.testclient import TestClient
from bridge.mt5_bridge import ConnectInput, TerminalService, create_app, indicators, TF_MINUTES

TOKEN = "test-only-local-bridge-token"
SECRET = "TEST_PASSWORD_NOT_TO_BE_RETAINED"

class FakeSDK:
    ACCOUNT_TRADE_MODE_DEMO = 0
    ACCOUNT_TRADE_MODE_REAL = 2
    def __init__(self):
        self.initialized = False
        self.calls = []
        self.account = SimpleNamespace(login=12345678, server="Fixture-XM-MT5", company="Test fixture", trade_mode=2, balance=120.5, equity=119.25, currency="USD")
        self.available = ["GOLDmicro", "GOLD.i#", "GOLD", "XAUUSDm", "XAUUSD.pro", "EURUSD.a"]
    def __getattr__(self, name):
        if name.startswith('TIMEFRAME_'): return name
        raise AttributeError(name)
    def initialize(self, *args, **kwargs):
        self.calls.append((args, dict(kwargs)))
        self.initialized = True
        return True
    def shutdown(self): self.initialized = False
    def account_info(self): return self.account if self.initialized else None
    def terminal_info(self): return SimpleNamespace(connected=self.initialized)
    def symbols_get(self):
        return [SimpleNamespace(name=n, description="Gold" if n.startswith(('GOLD','XAU')) else "Euro", currency_base="XAU" if n.startswith(('GOLD','XAU')) else "EUR", currency_profit="USD", custom=False, expiration_time=0) for n in self.available]
    def symbol_select(self, name, visible):
        self.selected = (name, visible)
        return name in self.available and visible
    def symbol_info(self, name): return SimpleNamespace(digits=2, point=.01, trade_tick_size=.01, trade_tick_value=1, trade_contract_size=100, volume_min=.01, volume_step=.01, volume_max=100, swap_long=0, swap_short=0)
    def copy_rates_from_pos(self, name, frame, pos, count):
        # Closed, deterministic fixture prices, intentionally not actual market data.
        seconds = TF_MINUTES.get(frame.replace("TIMEFRAME_", ""), 1) * 60
        end = int(time.time()) // seconds * seconds - pos * seconds
        return [dict(time=end-(count-i-1)*seconds, open=100+i, high=102+i, low=99+i, close=101+i, tick_volume=10+i, spread=20) for i in range(count)]
    def copy_rates_range(self, name, frame, start, end): return self.copy_rates_from_pos(name,frame,1,10)

class BridgeTests(unittest.TestCase):
    def setUp(self):
        self.sdk=FakeSDK();self.service=TerminalService(self.sdk)
        self.client=TestClient(create_app(self.service, TOKEN), base_url="http://127.0.0.1")
        self.headers={"X-MFE-Bridge-Token":TOKEN}
    def request(self,method,path,**kwargs):return self.client.request(method,path,headers=self.headers,**kwargs)
    def attach(self):return self.request('POST','/mt5/connect',json={})
    def test_auto_attach_has_no_credentials_and_reads_real_account(self):
        before=self.request('GET','/mt5/account').json();self.assertFalse(before['connected']);self.assertEqual(len(self.sdk.calls),0)
        response=self.attach().json();self.assertTrue(response['connected']);self.assertEqual(response['account_kind'],'REAL');self.assertFalse(response['trade_allowed'])
        self.assertEqual(self.sdk.calls[0],((),{'timeout':10000}));self.assertEqual(response['balance'],120.5)
    def test_path_and_manual_credentials_are_ephemeral(self):
        with tempfile.TemporaryDirectory() as folder:
            terminal=Path(folder)/'terminal64.exe';terminal.touch()
            response=self.request('POST','/mt5/connect',json={'terminal_path':str(terminal),'login':'123','password':SECRET,'server':'Fixture-Server'}).json()
            self.assertTrue(response['connected']);self.assertEqual(self.sdk.calls[-1][0],(str(terminal),));self.assertEqual(self.sdk.calls[-1][1]['password'],SECRET)
            self.assertNotIn(SECRET,json.dumps(response));self.assertNotIn(SECRET,repr(self.service.__dict__))
    def test_no_password_echo_on_validation_or_sdk_error(self):
        response=self.request('POST','/mt5/connect',json={'login':'not-a-number','password':SECRET});self.assertEqual(response.status_code,422);self.assertNotIn(SECRET,response.text)
        def broken(**kwargs):raise RuntimeError(SECRET)
        self.sdk.initialize=broken;response=self.request('POST','/mt5/connect',json={'login':'123','password':SECRET,'server':'Fixture'});self.assertNotIn(SECRET,response.text);self.assertEqual(response.json()['reason'],'MT5_INITIALIZE_FAILED')
    def test_symbol_priority_and_manual_override(self):
        self.attach();result=self.request('GET','/mt5/symbols?symbol=XAUUSD').json();self.assertEqual(result['broker_symbol'],'GOLD');self.assertEqual(self.sdk.selected,('GOLD',True))
        manual=self.request('POST','/mt5/resolve',json={'symbol':'XAUUSD','broker_symbol':'XAUUSDm'}).json();self.assertEqual(manual['broker_symbol'],'XAUUSDm')
        self.assertEqual(self.request('GET','/mt5/bars?symbol=XAUUSD&tf=H1&n=100').json()['broker_symbol'],'XAUUSDm')
    def test_external_account_change_clears_mapping_and_generation(self):
        self.attach();self.service.resolve('XAUUSD','XAUUSDm');generation=self.service.generation
        self.sdk.account.login=87654321;self.sdk.account.server='Different-broker'
        self.service.account();self.assertGreater(self.service.generation,generation);self.assertEqual(self.service.overrides,{})
    def test_closed_bars_and_real_observations(self):
        self.attach();data=self.request('GET','/mt5/live_bundle?symbol=XAUUSD&tf=H1&n=100').json();self.assertTrue(data['ok']);self.assertEqual(len(data['bars']),100);self.assertIn('ema10',data['observations']['indicators']);self.assertFalse(data['advice']['ok']);self.assertEqual(data['observations']['indicator_lookback'],100)
        bad=self.request('GET','/mt5/bars?n=1000000').json();self.assertFalse(bad['ok']);self.assertEqual(bad['bars'],[])
    def test_observed_indicators_match_historical_recurrences(self):
        result=indicators([{"c":101,"h":103,"l":99},{"c":105,"h":106,"l":100},{"c":104,"h":108,"l":103}])
        self.assertAlmostEqual(result["atr14"],206/49);self.assertAlmostEqual(result["ema10"],12359/121)

    def test_configured_broker_clock_normalizes_winter_and_summer(self):
        from datetime import datetime, timezone
        service=TerminalService(self.sdk, server_timezone='Europe/Athens')
        winter=int(datetime(2026,1,15,12,tzinfo=timezone.utc).timestamp())
        summer=int(datetime(2026,7,15,12,tzinfo=timezone.utc).timestamp())
        self.assertEqual(service.market_time(winter).isoformat(),'2026-01-15T10:00:00+00:00')
        self.assertEqual(service.market_time(summer).isoformat(),'2026-07-15T09:00:00+00:00')

    def test_server_clock_does_not_drop_recent_closed_bars(self):
        from datetime import datetime, timezone
        from zoneinfo import ZoneInfo
        service=TerminalService(self.sdk, server_timezone='Europe/Athens')
        service.connect(ConnectInput())
        source=self.sdk.copy_rates_from_pos
        zone=ZoneInfo('Europe/Athens')
        def broker_bars(*args):
            bars=source(*args)
            for bar in bars:
                bar['time']=int(datetime.fromtimestamp(bar['time'],timezone.utc).astimezone(zone).replace(tzinfo=timezone.utc).timestamp())
            return bars
        self.sdk.copy_rates_from_pos=broker_bars
        data=service.rates('XAUUSD','H1',100)
        self.assertEqual(len(data['bars']),100)
        self.assertLessEqual(datetime.fromisoformat(data['bars'][-1]['t'].replace('Z','+00:00')).timestamp()+3600,time.time()+1)
        latest=service.bar('XAUUSD','M1')
        self.assertLess(abs(time.time()-datetime.fromisoformat(latest['time'].replace('Z','+00:00')).timestamp()),61)

    def test_history_window_is_translated_to_configured_broker_clock(self):
        from datetime import datetime, timezone
        service=TerminalService(self.sdk,server_timezone='Europe/Athens');service.connect(ConnectInput())
        windows=[]
        def capture(name,frame,start,end):windows.append((start,end));return []
        self.sdk.copy_rates_range=capture
        service.history('XAUUSD','H1','2026-01-15T10:00:00Z','2026-01-15T11:00:00Z')
        self.assertEqual(windows[0],(datetime(2026,1,15,12,tzinfo=timezone.utc),datetime(2026,1,15,13,tzinfo=timezone.utc)))

    def test_live_mtf_cutoffs_do_not_outrun_the_main_closed_bar(self):
        from datetime import datetime
        self.attach();data=self.service.bundle('XAUUSD','H1',100)
        cutoff=datetime.fromisoformat(data['bars'][-1]['t'].replace('Z','+00:00')).timestamp()+3600
        for frame,row in data['observations_by_tf'].items():
            self.assertLessEqual(datetime.fromisoformat(row['as_of'].replace('Z','+00:00')).timestamp()+TF_MINUTES[frame]*60,cutoff)

    def test_invalid_prices_fail_closed(self):
        self.attach()
        self.sdk.copy_rates_from_pos=lambda *_args: [dict(time=int(time.time())-7200,open=float('nan'),high=2,low=1,close=1.5,tick_volume=1,spread=1)]
        data=self.service.rates('XAUUSD','H1',10);self.assertFalse(data['ok']);self.assertEqual(data['reason'],'INVALID_PRICE_OBSERVATION');self.assertEqual(data['bars'],[])

    def test_unsupported_platform_degrades(self):
        service=TerminalService(platform='linux');self.assertFalse(service.account()['supported']);self.assertFalse(service.connect(ConnectInput())['connected'])

    def test_tick_batch_preserves_ticks_with_identical_milliseconds(self):
        self.attach();now=int(time.time()*1000)
        rows=[dict(time=now//1000,time_msc=now,bid=100,ask=101,last=0,volume=0,flags=2),dict(time=now//1000,time_msc=now,bid=100.5,ask=101.5,last=0,volume=0,flags=2)]
        self.sdk.symbol_info_tick=lambda _name:SimpleNamespace(**rows[-1])
        self.sdk.copy_ticks_from=lambda *_args:rows
        self.sdk.COPY_TICKS_ALL=0
        first=self.service.ticks('XAUUSD','M1','');self.assertEqual(len(first['ticks']),2)
        self.assertEqual(self.service.ticks('XAUUSD','M1',first['cursor'])['ticks'],[])
        rows.append(dict(rows[-1],bid=100.6))
        next_frame=self.service.ticks('XAUUSD','M1',first['cursor']);self.assertEqual(len(next_frame['ticks']),1)
        self.assertEqual(next_frame['ticks'][0]['bid'],100.6)
        self.assertEqual(next_frame['bar']['tick_volume'],11)

    def test_tick_batch_generation_resets_after_detach(self):
        self.attach();self.sdk.symbol_info_tick=lambda _:SimpleNamespace(time=int(time.time()),time_msc=int(time.time()*1000))
        self.sdk.copy_ticks_from=lambda *_:[];self.sdk.COPY_TICKS_ALL=0
        result=self.service.ticks('XAUUSD','M1',f'{self.service.generation-1}:1000:1')
        self.assertFalse(result['ok']);self.assertEqual(result['reason'],'TERMINAL_CHANGED')
        self.service.disconnect();self.assertFalse(self.service.ticks('XAUUSD','M1','')['ok'])

    def test_tick_backlog_cannot_spin_without_cursor_progress(self):
        self.attach();now=int(time.time()*1000)
        row=dict(time=now//1000,time_msc=now,bid=100,ask=101,last=0,volume=0,flags=2)
        self.sdk.symbol_info_tick=lambda _:SimpleNamespace(**row)
        self.sdk.copy_ticks_from=lambda *_:[row]*8192;self.sdk.COPY_TICKS_ALL=0
        result=self.service.ticks('XAUUSD','M1',f'{self.service.generation}:{now}:8192')
        self.assertFalse(result['ok']);self.assertEqual(result['reason'],'TICK_BACKLOG_OVERFLOW')
    def test_auth_host_origin_and_execution_refusal(self):
        self.assertEqual(self.client.get('/mt5/account').status_code,403)
        self.assertEqual(self.client.get('/mt5/account',headers={**self.headers,'Origin':'https://attacker.invalid'}).status_code,403)
        for route in ['/mt5/demo_order','/mt5/close_position','/mt5/modify_position']:
            self.assertEqual(self.request('POST',route,json={}).status_code,404)
        self.assertEqual(self.client.get('/health',headers={'Host':'attacker.invalid'}).status_code,403)
    def test_disconnect_never_leaves_cached_account_data(self):
        self.attach();self.service.bundle('XAUUSD','H1',100);self.assertTrue(self.service.cache)
        self.request('POST','/mt5/disconnect',json={});self.assertFalse(self.service.account()['connected']);self.assertFalse(self.service.cache)
        self.assertFalse(self.request('GET','/mt5/live_bundle').json()['ok'])

if __name__=='__main__':unittest.main()
