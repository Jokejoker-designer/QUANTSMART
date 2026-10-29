"""Only SDK doubles are used here. Never submits a real broker transaction."""
import time
import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient
from types import SimpleNamespace
from bridge.mt5_bridge import TerminalService, ConnectInput, create_app
from bridge.demo_execution import DemoExecution, DemoPreviewInput, DemoSubmitInput
from test_mt5_bridge import FakeSDK

class DemoSDK(FakeSDK):
    COPY_TICKS_ALL=0
    TRADE_ACTION_DEAL=1
    ORDER_TYPE_BUY=0
    ORDER_TYPE_SELL=1
    ORDER_TIME_GTC=0
    ORDER_FILLING_IOC=1
    ORDER_FILLING_FOK=0
    ORDER_FILLING_RETURN=2
    SYMBOL_TRADE_EXECUTION_MARKET=2
    def __init__(self):
        super().__init__();self.account.trade_mode=0;self.account.trade_allowed=True;self.account.trade_expert=True;self.sent=[];self.positions=[]
    def terminal_info(self):return SimpleNamespace(connected=self.initialized,trade_allowed=True,tradeapi_disabled=False)
    def symbol_info(self,name):return SimpleNamespace(volume_min=.01,volume_max=10,volume_step=.01,point=.01,filling_mode=2,trade_exemode=2,trade_stops_level=1)
    def symbol_info_tick(self,name):return SimpleNamespace(time=int(time.time()),bid=100.,ask=100.02)
    def order_check(self,request):return SimpleNamespace(retcode=0)
    def order_send(self,request):
        self.sent.append(dict(request));return SimpleNamespace(retcode=10009,order=900,deal=901,volume=request['volume'],price=100.02 if request['type']==0 else 100.)
    def positions_get(self,**kwargs):return tuple(p for p in self.positions if not kwargs.get('ticket') or p.ticket==kwargs['ticket'])

class DemoTests(unittest.TestCase):
    def setUp(self):
        self.sdk=DemoSDK();self.terminal=TerminalService(self.sdk);self.terminal.connect(ConnectInput());self.demo=DemoExecution(self.terminal,enabled=True)
    def test_default_installation_has_no_demo_execution_authority(self):
        self.assertFalse(DemoExecution(self.terminal).status()['available'])
        self.assertEqual(self.sdk.sent,[])
    def preview(self,**kwargs):return self.demo.preview(DemoPreviewInput(symbol='XAUUSD',side='BUY',volume=.01,**kwargs))
    def send(self,preview):return self.demo.submit(DemoSubmitInput(preview_id=preview['preview_id'],confirm_demo=True))
    def test_real_account_cannot_preview_or_send(self):
        self.sdk.account.trade_mode=2;self.assertFalse(self.preview()['ok']);self.assertEqual(self.sdk.sent,[])
    def test_preview_never_sends_and_duplicate_submit_is_idempotent(self):
        preview=self.preview();self.assertTrue(preview['ok']);self.assertEqual(self.sdk.sent,[])
        result=self.send(preview);self.assertEqual(result['state'],'filled');self.assertEqual(self.send(preview),result);self.assertEqual(len(self.sdk.sent),1)
        self.assertFalse(result['real_execution_allowed'])
    def test_switch_to_real_after_preview_cannot_send(self):
        preview=self.preview();self.sdk.account.trade_mode=2;self.assertFalse(self.send(preview)['ok']);self.assertEqual(self.sdk.sent,[])
    def test_other_demo_account_after_preview_cannot_send(self):
        preview=self.preview();self.sdk.account.login+=1;self.assertFalse(self.send(preview)['ok']);self.assertEqual(self.sdk.sent,[])
    def test_expiry_price_change_and_invalid_volume_fail_closed(self):
        self.assertFalse(self.demo.preview(DemoPreviewInput(volume=.015))['ok'])
        preview=self.preview();self.demo.requests[preview['preview_id']]['created']-=31;self.assertFalse(self.send(preview)['ok'])
        preview=self.preview();self.sdk.symbol_info_tick=lambda _:SimpleNamespace(time=int(time.time()),bid=101.,ask=101.02)
        self.assertFalse(self.send(preview)['ok']);self.assertEqual(self.sdk.sent,[])
    def test_close_binds_actual_position_and_volume(self):
        self.sdk.positions=[SimpleNamespace(ticket=555,symbol='GOLD.i#',volume=.02,type=0)]
        preview=self.demo.preview(DemoPreviewInput(kind='CLOSE',ticket=555));self.assertTrue(preview['ok'])
        self.send(preview);self.assertEqual(self.sdk.sent[0]['position'],555);self.assertEqual(self.sdk.sent[0]['type'],1);self.assertEqual(self.sdk.sent[0]['symbol'],'GOLD.i#')
    def test_changed_position_and_unknown_broker_result_are_not_reported_filled(self):
        self.sdk.positions=[SimpleNamespace(ticket=555,symbol='GOLD',volume=.02,type=0)]
        preview=self.demo.preview(DemoPreviewInput(kind='CLOSE',ticket=555));self.sdk.positions[0].volume=.01
        self.assertFalse(self.send(preview)['ok']);self.assertEqual(self.sdk.sent,[])
        preview=self.preview();self.sdk.order_send=lambda _:None;self.assertEqual(self.send(preview)['state'],'unknown')
    def test_broker_rejection_is_visible(self):
        preview=self.preview();self.sdk.order_send=lambda _:SimpleNamespace(retcode=10019,order=0,deal=0,volume=0.,price=0.)
        self.assertEqual(self.send(preview)['state'],'rejected')
    def test_http_preview_requires_local_session_and_explicit_confirmation(self):
        with patch.dict('os.environ',{'MFE_ENABLE_MANUAL_DEMO':'true'}):
            client=TestClient(create_app(self.terminal,'fixture-token'),base_url='http://127.0.0.1')
        headers={'X-MFE-Bridge-Token':'fixture-token'}
        self.assertEqual(client.post('/mt5/demo/preview',json={'volume':.01}).status_code,403)
        preview=client.post('/mt5/demo/preview',headers=headers,json={'volume':.01}).json();self.assertTrue(preview['ok'])
        self.assertEqual(client.post('/mt5/demo/submit',headers=headers,json={'preview_id':preview['preview_id'],'confirm_demo':False}).status_code,422)
        self.assertEqual(self.sdk.sent,[])
        self.sdk.account.trade_mode=2
        result=client.post('/mt5/demo/submit',headers=headers,json={'preview_id':preview['preview_id'],'confirm_demo':True}).json()
        self.assertFalse(result['ok']);self.assertEqual(self.sdk.sent,[])

if __name__=='__main__':unittest.main()
