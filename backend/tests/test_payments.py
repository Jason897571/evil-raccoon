"""支付相关：发电付款、支付宝通知、回来查单。支付宝的网络调用全部打桩。"""

from app import alipay_client
from app.config import settings
from tests.conftest import login, login_admin


def fake_alipay(monkeypatch, *, verify=True, query=(True, "2026111622001", None)):
    monkeypatch.setattr(settings, "alipay_app_id", "2021000000000000")
    monkeypatch.setattr(alipay_client, "is_configured", lambda: True)
    monkeypatch.setattr(alipay_client, "page_pay_url", lambda no, cents, subject, ret: f"https://alipay.test/pay?no={no}&amt={cents}")
    monkeypatch.setattr(alipay_client, "verify_notify", lambda form: verify)
    monkeypatch.setattr(alipay_client, "query_paid", lambda no: query)


def notify(client, **form):
    base = {"app_id": "2021000000000000", "trade_status": "TRADE_SUCCESS", "trade_no": "2026111622001", "sign": "x"}
    return client.post("/api/payments/alipay/notify", data={**base, **form})


def tier_id(client) -> int:
    return client.get("/api/support").json()["tiers"][0]["id"]


# ---------- 发电 ----------

def test_support_dev_mock_pays_immediately(client):
    res = client.post("/api/support/pay", json={"tier_id": tier_id(client), "name": "小明", "message": "加油"})
    assert res.status_code == 201
    no = res.json()["out_trade_no"]
    assert res.json()["pay_url"] == f"/support/thanks?no={no}"
    got = client.get(f"/api/support/payments/{no}").json()
    assert (got["status"], got["amount_cents"], got["tier_name"], got["supporter_name"]) == ("paid", 500, "邪恶小镰刀", "小明")


def test_support_amount_validation(client):
    assert client.post("/api/support/pay", json={}).status_code == 422
    assert client.post("/api/support/pay", json={"tier_id": tier_id(client), "amount_cents": 1000}).status_code == 422
    assert client.post("/api/support/pay", json={"amount_cents": 50}).status_code == 422  # 低于 1 元
    assert client.post("/api/support/pay", json={"amount_cents": 600_000}).status_code == 422
    assert client.post("/api/support/pay", json={"tier_id": 99999}).status_code == 404
    assert client.post("/api/support/pay", json={"amount_cents": 888}).json()["out_trade_no"].startswith("ES")


def test_support_closed_in_prod_without_alipay(client, monkeypatch):
    monkeypatch.setattr(settings, "app_env", "prod")
    assert client.get("/api/support").json()["pay_enabled"] is False
    assert client.post("/api/support/pay", json={"amount_cents": 1000}).status_code == 503


def test_support_alipay_flow_via_notify(client, monkeypatch):
    fake_alipay(monkeypatch, query=(False, None, None))
    res = client.post("/api/support/pay", json={"amount_cents": 1288}).json()
    no = res["out_trade_no"]
    assert res["pay_url"].startswith("https://alipay.test/pay")
    assert client.get(f"/api/support/payments/{no}").json()["status"] == "pending"

    assert notify(client, out_trade_no=no, total_amount="1.00").text == "failure"  # 金额对不上
    assert notify(client, out_trade_no=no, total_amount="12.88").text == "success"
    assert client.get(f"/api/support/payments/{no}").json()["status"] == "paid"


def test_support_paid_via_query_when_notify_missing(client, monkeypatch):
    fake_alipay(monkeypatch, query=(True, "T1", "20.00"))
    no = client.post("/api/support/pay", json={"amount_cents": 2000}).json()["out_trade_no"]
    assert client.get(f"/api/support/payments/{no}").json()["status"] == "paid"


def test_notify_rejects_bad_signature_and_app_id(client, monkeypatch):
    fake_alipay(monkeypatch, verify=False)
    no = client.post("/api/support/pay", json={"amount_cents": 1000}).json()["out_trade_no"]
    assert notify(client, out_trade_no=no, total_amount="10.00").text == "failure"
    fake_alipay(monkeypatch, verify=True, query=(False, None, None))
    assert notify(client, out_trade_no=no, total_amount="10.00", app_id="2088other").text == "failure"
    assert client.get(f"/api/support/payments/{no}").json()["status"] == "pending"


def test_admin_sees_paid_supporters(client):
    client.post("/api/support/pay", json={"amount_cents": 666, "name": "阿浣"})
    login_admin(client)
    rows = client.get("/api/admin/support/payments").json()
    assert [(r["supporter_name"], r["amount_cents"]) for r in rows] == [("阿浣", 666)]


# ---------- 特效包订单 ----------

def test_order_pay_needs_alipay(client):
    login(client)
    no = client.post("/api/orders", json={"slugs": ["time"]}).json()["order_no"]
    assert client.post(f"/api/orders/{no}/pay").status_code == 503


def test_order_alipay_notify_marks_paid(client, monkeypatch):
    fake_alipay(monkeypatch, query=(False, None, None))
    login(client)
    no = client.post("/api/orders", json={"slugs": ["time", "fire"]}).json()["order_no"]
    assert "alipay.test" in client.post(f"/api/orders/{no}/pay").json()["pay_url"]

    assert notify(client, out_trade_no=no, total_amount="29.90").text == "failure"
    assert notify(client, out_trade_no=no, total_amount="49.80").text == "success"
    order = client.get(f"/api/orders/{no}").json()
    assert order["status"] == "paid"
    assert {i["slug"] for i in client.get("/api/library").json()} == {"time", "fire"}
    assert client.post(f"/api/orders/{no}/pay").status_code == 409  # 付过不能再付


def test_order_sync_marks_paid_via_query(client, monkeypatch):
    fake_alipay(monkeypatch, query=(True, "T9", "9.90"))
    login(client)
    no = client.post("/api/orders", json={"slugs": ["wind"]}).json()["order_no"]
    assert client.post(f"/api/orders/{no}/sync").json()["status"] == "paid"


def test_real_sdk_builds_signed_url_from_raw_or_pem_keys(monkeypatch):
    import base64
    from urllib.parse import parse_qs, urlparse

    from Cryptodome.PublicKey import RSA

    key = RSA.generate(2048)
    raw_pkcs1 = base64.b64encode(key.export_key(format="DER", pkcs=1)).decode()
    raw_pkcs8 = base64.b64encode(key.export_key(format="DER", pkcs=8)).decode()
    pub_raw = base64.b64encode(key.publickey().export_key(format="DER")).decode()
    for private in (raw_pkcs1, raw_pkcs8, key.export_key().decode()):
        alipay_client.client.cache_clear()
        monkeypatch.setattr(settings, "alipay_app_id", "2021000000000000")
        monkeypatch.setattr(settings, "alipay_private_key", private)
        monkeypatch.setattr(settings, "alipay_public_key", pub_raw)
        monkeypatch.setattr(settings, "alipay_notify_url", "https://example.com/api/payments/alipay/notify")
        url = alipay_client.page_pay_url("ER123", 2990, "测试", "https://example.com/orders/ER123")
        q = parse_qs(urlparse(url).query)
        assert url.startswith("https://openapi.alipay.com/gateway.do?")
        assert q["method"] == ["alipay.trade.page.pay"] and q["sign_type"] == ["RSA2"] and q["sign"][0]
        assert '"total_amount":"29.90"' in q["biz_content"][0]
    alipay_client.client.cache_clear()
