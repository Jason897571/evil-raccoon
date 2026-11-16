from datetime import timedelta

from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from app.db import engine
from app.models import LoginCode, User, UserSession, utcnow
from tests.conftest import login


def test_register_with_code_and_password(client):
    res = client.post("/api/auth/code", json={"email": "Fan@Example.com", "purpose": "register"})
    assert res.status_code == 200
    code = res.json()["dev_code"]
    assert len(code) == 6

    assert client.get("/api/auth/me").json()["user"] is None
    body = {"email": "fan@example.com", "code": code, "password": "raccoon-123", "display_name": " 小粉丝 "}
    assert client.post("/api/auth/register", json={**body, "password": "short"}).status_code == 422
    res = client.post("/api/auth/register", json=body)
    assert res.status_code == 201, res.text
    assert res.json()["email"] == "fan@example.com" and res.json()["is_admin"] is False
    assert "er_session" in res.cookies

    me = client.get("/api/auth/me").json()
    assert me["user"]["display_name"] == "小粉丝" and me["user"]["has_password"] is True
    assert me["dev_tools"] is True

    # 注册完能用密码登录
    client.post("/api/auth/logout")
    assert client.post("/api/auth/password-login",
                       json={"email": "fan@example.com", "password": "raccoon-123"}).status_code == 200


def test_register_rejects_existing_email(client):
    res = client.post("/api/auth/code", json={"email": "boss@example.com", "purpose": "register"})
    assert res.status_code == 409


def test_login_and_reset_need_registered_email(client):
    for purpose in ("login", "reset"):
        res = client.post("/api/auth/code", json={"email": f"{purpose}-ghost@example.com", "purpose": purpose})
        assert res.status_code == 400 and "还没注册" in res.json()["detail"]
    # 注册验证码也不能拿来直接「验证码登录」建号
    code = client.post("/api/auth/code", json={"email": "ghost@example.com", "purpose": "register"}).json()["dev_code"]
    res = client.post("/api/auth/login", json={"email": "ghost@example.com", "code": code})
    assert res.status_code == 400
    with Session(engine) as db:
        assert db.scalar(select(User).where(User.email == "ghost@example.com")) is None


def test_code_login_for_registered_user(client):
    login(client, "a@example.com", legacy=True)
    assert client.get("/api/auth/me").json()["user"]["email"] == "a@example.com"


def test_code_is_single_use(client):
    with Session(engine) as db:
        db.add(User(email="a@example.com"))
        db.commit()
    code = client.post("/api/auth/code", json={"email": "a@example.com"}).json()["dev_code"]
    assert client.post("/api/auth/login", json={"email": "a@example.com", "code": code}).status_code == 200
    client.post("/api/auth/logout")
    res = client.post("/api/auth/login", json={"email": "a@example.com", "code": code})
    assert res.status_code == 400


def test_logout_clears_session(client):
    login(client)
    assert client.post("/api/auth/logout").status_code == 204
    assert client.get("/api/auth/me").json()["user"] is None


def test_resend_is_throttled(client):
    assert client.post("/api/auth/code", json={"email": "b@example.com", "purpose": "register"}).status_code == 200
    res = client.post("/api/auth/code", json={"email": "b@example.com", "purpose": "register"})
    assert res.status_code == 429
    assert "秒后" in res.json()["detail"]


def test_wrong_code_locks_after_five_attempts(client):
    code = client.post("/api/auth/code", json={"email": "c@example.com", "purpose": "register"}).json()["dev_code"]
    wrong = "000000" if code != "000000" else "111111"
    body = {"email": "c@example.com", "password": "raccoon-123"}
    for _ in range(5):
        assert client.post("/api/auth/register", json={**body, "code": wrong}).status_code == 400
    res = client.post("/api/auth/register", json={**body, "code": code})
    assert res.status_code == 400
    assert "次数" in res.json()["detail"]


def test_expired_code_rejected(client):
    code = client.post("/api/auth/code", json={"email": "d@example.com", "purpose": "register"}).json()["dev_code"]
    with Session(engine) as db:
        rec = db.scalar(select(LoginCode).where(LoginCode.email == "d@example.com"))
        db.execute(update(LoginCode).where(LoginCode.id == rec.id).values(expires_at=rec.created_at - timedelta(seconds=1)))
        db.commit()
    res = client.post("/api/auth/register", json={"email": "d@example.com", "code": code, "password": "raccoon-123"})
    assert res.status_code == 400
    assert "失效" in res.json()["detail"]


def test_invalid_email_rejected(client):
    assert client.post("/api/auth/code", json={"email": "not-an-email"}).status_code == 422


def test_only_first_registered_user_is_admin(client):
    with Session(engine) as db:
        db.execute(delete(User))
        db.commit()

    login(client, "first@example.com")
    assert client.get("/api/auth/me").json()["user"]["is_admin"] is True
    client.post("/api/auth/logout")

    login(client, "second@example.com")
    assert client.get("/api/auth/me").json()["user"]["is_admin"] is False
    client.post("/api/auth/logout")

    # 全库只有一个管理员，就是第一个注册的
    with Session(engine) as db:
        assert db.scalars(select(User.email).where(User.is_admin.is_(True))).all() == ["first@example.com"]


def test_update_display_name(client):
    assert client.patch("/api/auth/me", json={"display_name": "x"}).status_code == 401
    login(client)
    res = client.patch("/api/auth/me", json={"display_name": "  小浣熊  "})
    assert res.status_code == 200
    assert res.json()["display_name"] == "小浣熊"
    assert client.get("/api/auth/me").json()["user"]["display_name"] == "小浣熊"
    assert client.patch("/api/auth/me", json={"display_name": ""}).json()["display_name"] is None
    assert client.patch("/api/auth/me", json={"display_name": "长" * 41}).status_code == 422


def test_logout_others_keeps_current_session(client):
    login(client)
    with Session(engine) as db:
        user = db.scalar(select(User).where(User.email == "fan@example.com"))
        db.add(UserSession(user_id=user.id, token_hash="other-device", expires_at=utcnow() + timedelta(days=1),
                           created_at=utcnow()))
        db.commit()
        user_id = user.id
    res = client.post("/api/auth/logout-others")
    assert res.json() == {"revoked": 1}
    assert client.get("/api/auth/me").json()["user"]["email"] == "fan@example.com"
    with Session(engine) as db:
        assert db.scalar(select(func.count(UserSession.id)).where(UserSession.user_id == user_id)) == 1
