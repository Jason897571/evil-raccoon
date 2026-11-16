from app.config import settings
from tests.conftest import login, login_admin

GIF = b"GIF89a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00!\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;"


def buy(client, email: str, slugs: list[str]) -> str:
    login(client, email)
    order_no = client.post("/api/orders", json={"slugs": slugs}).json()["order_no"]
    assert client.post(f"/api/orders/{order_no}/mock-pay").status_code == 200
    return order_no


def test_pack_create_edit_delete(client):
    login_admin(client)
    body = {"slug": "blood-2", "name": "血 2", "element": "血", "price_cents": 1990}
    res = client.post("/api/admin/packs", json=body)
    assert res.status_code == 201, res.text
    assert res.json()["is_published"] is False and res.json()["skill_count"] == 0
    assert client.post("/api/admin/packs", json=body).status_code == 409
    assert client.post("/api/admin/packs", json={**body, "slug": "Bad Slug"}).status_code == 422
    # 未上架时前台看不到
    assert client.get("/api/packs/blood-2").status_code == 404

    res = client.patch("/api/admin/packs/blood-2", json={"is_published": True, "cover_url": "/media/x.png",
                                                         "netdisk_url": "  "})
    assert res.json()["is_published"] is True and res.json()["netdisk_url"] is None
    assert client.get("/api/packs/blood-2").status_code == 200
    assert "血" in client.get("/api/home").json()["elements"]

    assert client.delete("/api/admin/packs/blood-2").status_code == 204
    assert client.get("/api/admin/packs/blood-2").status_code == 404


def test_pack_with_orders_cannot_be_deleted(client):
    buy(client, "fan@example.com", ["fire"])
    login_admin(client)
    res = client.delete("/api/admin/packs/fire")
    assert res.status_code == 409
    packs = {p["slug"]: p for p in client.get("/api/admin/packs").json()}
    assert packs["fire"]["sold_count"] == 1 and packs["time"]["sold_count"] == 0


def test_skill_add_edit_delete(client):
    login_admin(client)
    skill = {"code": "time_02_rewind", "name": "回溯", "phases": "spawn / loop", "sheet_cols": 8, "sheet_rows": 2}
    res = client.post("/api/admin/packs/time/skills", json=skill)
    assert res.status_code == 201 and res.json()["sort_order"] == 1
    assert client.post("/api/admin/packs/time/skills", json=skill).status_code == 409
    res = client.patch("/api/admin/packs/time/skills/time_02_rewind", json={"preview_gif_url": "/media/a.gif"})
    assert res.json()["preview_gif_url"] == "/media/a.gif"
    assert [s["code"] for s in client.get("/api/packs/time").json()["skills"]] == ["time_01", "time_02_rewind"]
    assert client.delete("/api/admin/packs/time/skills/time_02_rewind").status_code == 204
    assert client.get("/api/admin/packs/time").json()["skill_count"] == 1


def test_upload_image(client, tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "media_dir", tmp_path)
    assert client.post("/api/admin/uploads", files={"file": ("a.gif", GIF, "image/gif")}).status_code == 401
    login_admin(client)
    res = client.post("/api/admin/uploads", files={"file": ("a.gif", GIF, "image/gif")})
    assert res.status_code == 201
    url = res.json()["url"]
    assert url.startswith("/media/uploads/") and url.endswith(".gif")
    assert (tmp_path / url.removeprefix("/media/")).read_bytes() == GIF
    # 改扩展名骗不过去：按文件内容判断
    res = client.post("/api/admin/uploads", files={"file": ("evil.png", b"<script>", "image/png")})
    assert res.status_code == 415


def test_users_list_and_detail(client):
    order_no = buy(client, "fan@example.com", ["time", "wind"])
    client.post("/api/orders", json={"slugs": ["fire"]})  # 一笔待付款
    client.post("/api/support/pay", json={"amount_cents": 800, "name": "小粉丝"})
    client.patch("/api/auth/me", json={"display_name": "小粉丝"})

    login(client, "other@example.com")  # 普通客户看不到
    assert client.get("/api/admin/users").status_code == 403
    login_admin(client)
    rows = client.get("/api/admin/users").json()
    fan = next(r for r in rows if r["email"] == "fan@example.com")
    assert fan["paid_order_count"] == 1 and fan["paid_cents"] == 2990 + 990 and fan["support_cents"] == 800
    assert [r["email"] for r in client.get("/api/admin/users", params={"q": "小粉"}).json()] == ["fan@example.com"]

    detail = client.get(f"/api/admin/users/{fan['id']}").json()
    assert detail["user"]["display_name"] == "小粉丝"
    assert detail["pending_order_count"] == 1 and len(detail["orders"]) == 2
    assert {o["slug"] for o in detail["owned"]} == {"time", "wind"}
    assert detail["owned"][0]["order_no"] == order_no
    assert detail["support_count"] == 1 and detail["session_count"] == 1
    assert client.get("/api/admin/users/999999").status_code == 404


def test_force_logout_user(client):
    login(client)
    login_admin(client)
    rows = {r["email"]: r for r in client.get("/api/admin/users").json()}
    res = client.post(f"/api/admin/users/{rows['fan@example.com']['id']}/logout-all")
    assert res.json() == {"revoked": 1}
    assert client.post(f"/api/admin/users/{rows['boss@example.com']['id']}/logout-all").status_code == 400


def test_api_token_cannot_read_users(client):
    login_admin(client)
    token = client.post("/api/admin/tokens", json={"name": "脚本"}).json()["token"]
    client.post("/api/auth/logout")
    headers = {"Authorization": f"Bearer {token}"}
    assert client.get("/api/admin/packs", headers=headers).status_code == 200
    assert client.post("/api/admin/packs", headers=headers,
                       json={"slug": "api-pack", "name": "API", "element": "火", "price_cents": 100}).status_code == 201
    assert client.get("/api/admin/users", headers=headers).status_code == 401
