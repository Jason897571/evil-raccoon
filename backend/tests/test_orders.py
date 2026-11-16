from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from tests.conftest import login


def test_orders_require_login(client):
    assert client.post("/api/orders", json={"slugs": ["time"]}).status_code == 401
    assert client.get("/api/orders").status_code == 401
    assert client.get("/api/library").status_code == 401


def test_create_order_snapshots_items(client):
    login(client)
    res = client.post("/api/orders", json={"slugs": ["time", "fire", "time"]})
    assert res.status_code == 201
    order = res.json()
    assert order["status"] == "pending"
    assert order["total_cents"] == 2990 + 1990
    assert [i["slug"] for i in order["items"]] == ["time", "fire"]
    assert order["order_no"].startswith("ER")

    listed = client.get("/api/orders").json()
    assert [o["order_no"] for o in listed] == [order["order_no"]]
    assert client.get(f"/api/orders/{order['order_no']}").json()["total_cents"] == 4980


def test_unknown_pack_rejected(client):
    login(client)
    res = client.post("/api/orders", json={"slugs": ["time", "nope"]})
    assert res.status_code == 404
    assert "nope" in res.json()["detail"]


def test_mock_pay_unlocks_library(client):
    login(client)
    assert client.get("/api/library").json() == []
    no = client.post("/api/orders", json={"slugs": ["time"]}).json()["order_no"]

    paid = client.post(f"/api/orders/{no}/mock-pay").json()
    assert paid["status"] == "paid"
    assert paid["paid_at"] is not None

    lib = client.get("/api/library").json()
    assert [(i["slug"], i["netdisk_url"], i["netdisk_code"]) for i in lib] == [
        ("time", "https://pan.example.com/time", "abcd")
    ]
    # 付过一次再点不会出错
    assert client.post(f"/api/orders/{no}/mock-pay").json()["status"] == "paid"


def test_cannot_buy_owned_pack_twice(client):
    login(client)
    no = client.post("/api/orders", json={"slugs": ["time"]}).json()["order_no"]
    client.post(f"/api/orders/{no}/mock-pay")
    res = client.post("/api/orders", json={"slugs": ["time", "fire"]})
    assert res.status_code == 409
    assert "时间" in res.json()["detail"]


def test_second_pending_order_with_same_pack_cannot_be_paid(client):
    login(client)
    first = client.post("/api/orders", json={"slugs": ["time"]}).json()["order_no"]
    second = client.post("/api/orders", json={"slugs": ["time"]}).json()["order_no"]
    client.post(f"/api/orders/{first}/mock-pay")
    assert client.post(f"/api/orders/{second}/mock-pay").status_code == 409


def test_cancel_only_pending(client):
    login(client)
    no = client.post("/api/orders", json={"slugs": ["fire"]}).json()["order_no"]
    assert client.post(f"/api/orders/{no}/cancel").json()["status"] == "cancelled"
    assert client.post(f"/api/orders/{no}/cancel").status_code == 409
    assert client.post(f"/api/orders/{no}/mock-pay").status_code == 409

    paid = client.post("/api/orders", json={"slugs": ["wind"]}).json()["order_no"]
    client.post(f"/api/orders/{paid}/mock-pay")
    assert client.post(f"/api/orders/{paid}/cancel").status_code == 409


def test_orders_are_private(client):
    login(client, "owner@example.com")
    no = client.post("/api/orders", json={"slugs": ["time"]}).json()["order_no"]

    with TestClient(app) as other:
        login(other, "other@example.com")
        assert other.get(f"/api/orders/{no}").status_code == 404
        assert other.post(f"/api/orders/{no}/mock-pay").status_code == 404
        assert other.get("/api/orders").json() == []


def test_mock_pay_hidden_outside_dev(client, monkeypatch):
    login(client)
    no = client.post("/api/orders", json={"slugs": ["time"]}).json()["order_no"]
    monkeypatch.setattr(settings, "app_env", "prod")
    assert client.post(f"/api/orders/{no}/mock-pay").status_code == 404
    assert client.get("/api/auth/me").json()["dev_tools"] is False
