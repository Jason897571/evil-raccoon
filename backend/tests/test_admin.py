from io import BytesIO

from fastapi.testclient import TestClient
from PIL import Image

from app.config import settings

from app.main import app
from tests.conftest import login, login_admin


def make_token(client) -> str:
    res = client.post("/api/admin/tokens", json={"name": "发布脚本"})
    assert res.status_code == 201, res.text
    return res.json()["token"]


def test_me_reports_role(client):
    login(client)
    assert client.get("/api/auth/me").json()["user"] == {"email": "fan@example.com", "is_admin": False}


def test_admin_endpoints_reject_customers_and_anonymous(client):
    assert client.get("/api/admin/packs").status_code == 401
    assert client.get("/api/admin/tokens").status_code == 401
    login(client)
    assert client.get("/api/admin/packs").status_code == 403
    assert client.post("/api/admin/tiers", json={"name": "x", "price_cents": 100}).status_code == 403
    assert client.post("/api/admin/tokens", json={"name": "x"}).status_code == 403


def test_public_support_shows_active_tiers_and_no_qr_yet(client):
    info = client.get("/api/support").json()
    assert [t["name"] for t in info["tiers"]] == ["邪恶小镰刀"]
    assert info["alipay_qr_url"] is None
    assert info["alipay_note"] == ""


def test_admin_edits_tiers(client):
    login_admin(client)
    assert len(client.get("/api/admin/tiers").json()) == 2

    created = client.post("/api/admin/tiers", json={
        "name": "夜行浣熊", "price_cents": 1500, "description": "新包提前 7 天\n投票选主题", "sort_order": 1,
    })
    assert created.status_code == 201
    tid = created.json()["id"]

    res = client.patch(f"/api/admin/tiers/{tid}", json={"price_cents": 1800})
    assert res.json()["price_cents"] == 1800
    assert res.json()["description"] == "新包提前 7 天\n投票选主题"
    assert client.patch(f"/api/admin/tiers/{tid}", json={"name": None}).status_code == 422

    assert [t["name"] for t in client.get("/api/support").json()["tiers"]] == ["邪恶小镰刀", "夜行浣熊"]
    assert client.delete(f"/api/admin/tiers/{tid}").status_code == 204
    assert client.get(f"/api/admin/tiers").json()[-1]["name"] == "隐藏档"


def test_token_shown_once_and_listed_by_prefix(client):
    login_admin(client)
    token = make_token(client)
    assert token.startswith("er_")
    listed = client.get("/api/admin/tokens").json()
    assert listed[0]["prefix"] == token[:10]
    assert "token" not in listed[0]


def test_token_can_publish_and_edit_packs(client):
    login_admin(client)
    token = make_token(client)
    api = TestClient(app)  # 不带 cookie，只用 token
    auth = {"Authorization": f"Bearer {token}"}

    res = api.patch("/api/admin/packs/fire", json={"is_published": False}, headers=auth)
    assert res.status_code == 200
    assert res.json()["is_published"] is False
    assert "fire" not in [p["slug"] for p in api.get("/api/packs").json()]
    assert api.get("/api/packs/fire").status_code == 404

    res = api.patch("/api/admin/packs/fire", headers=auth, json={
        "is_published": True, "price_cents": 2490, "summary": "新简介", "netdisk_url": "https://pan.example.com/new",
    })
    body = res.json()
    assert (body["is_published"], body["price_cents"], body["summary"]) == (True, 2490, "新简介")
    assert next(p for p in api.get("/api/packs").json() if p["slug"] == "fire")["price_cents"] == 2490

    res = api.patch("/api/admin/packs/fire/skills/fire_01", json={"name": "火球术"}, headers=auth)
    assert res.json()["name"] == "火球术"
    assert api.get("/api/packs/fire").json()["skills"][0]["name"] == "火球术"

    assert api.get("/api/admin/tokens").status_code == 401  # token 不能管理 token
    assert client.get("/api/admin/tokens").json()[0]["last_used_at"] is not None


def test_revoked_or_wrong_token_rejected(client):
    login_admin(client)
    token = make_token(client)
    api = TestClient(app)
    assert api.get("/api/admin/packs", headers={"Authorization": "Bearer er_nope"}).status_code == 401

    tid = client.get("/api/admin/tokens").json()[0]["id"]
    assert client.post(f"/api/admin/tokens/{tid}/revoke").json()["revoked_at"] is not None
    assert api.get("/api/admin/packs", headers={"Authorization": f"Bearer {token}"}).status_code == 401


def test_unpublished_pack_cannot_be_ordered(client):
    login_admin(client)
    client.patch("/api/admin/packs/wind", json={"is_published": False})
    client.post("/api/auth/logout")
    login(client)
    res = client.post("/api/orders", json={"slugs": ["wind"]})
    assert res.status_code == 409
    assert "下架" in res.json()["detail"]


def png_bytes(size=(300, 300)) -> bytes:
    buf = BytesIO()
    Image.new("RGB", size, (0, 120, 255)).save(buf, format="PNG")
    return buf.getvalue()


def test_alipay_qr_upload_replace_delete(client, monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "media_dir", tmp_path)
    login_admin(client)

    res = client.post("/api/admin/support/alipay-qr", files={"file": ("qr.jpg", png_bytes(), "image/jpeg")})
    assert res.status_code == 200, res.text
    first = res.json()["alipay_qr_url"]
    assert first.startswith("/media/site/alipay-qr-") and first.endswith(".png")
    assert (tmp_path / first.removeprefix("/media/")).exists()
    assert client.get("/api/support").json()["alipay_qr_url"] == first

    second = client.post(
        "/api/admin/support/alipay-qr", files={"file": ("qr2.png", png_bytes((400, 400)), "image/png")}
    ).json()["alipay_qr_url"]
    assert second != first
    assert not (tmp_path / first.removeprefix("/media/")).exists()  # 旧图删掉

    note = client.patch("/api/admin/support", json={"alipay_note": "付款时备注你的昵称"}).json()
    assert note["alipay_note"] == "付款时备注你的昵称"

    assert client.delete("/api/admin/support/alipay-qr").json()["alipay_qr_url"] is None
    assert not (tmp_path / second.removeprefix("/media/")).exists()


def test_alipay_qr_rejects_non_images_and_customers(client, monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "media_dir", tmp_path)
    login(client)
    files = {"file": ("qr.png", png_bytes(), "image/png")}
    assert client.post("/api/admin/support/alipay-qr", files=files).status_code == 403
    client.post("/api/auth/logout")

    login_admin(client)
    res = client.post("/api/admin/support/alipay-qr", files={"file": ("x.png", b"not an image", "image/png")})
    assert res.status_code == 422
    assert client.get("/api/support").json()["alipay_qr_url"] is None
