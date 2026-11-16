from datetime import timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.db import engine
from app.models import LoginCode, User, UserSession, utcnow
from tests.conftest import login

EMAIL = "fan@example.com"


def fresh_code(client, email: str = EMAIL, purpose: str = "login") -> str:
    """测试里绕过 60 秒重发限制：先清掉这个邮箱的旧验证码。"""
    with Session(engine) as db:
        db.execute(delete(LoginCode).where(LoginCode.email == email))
        db.commit()
    return client.post("/api/auth/code", json={"email": email, "purpose": purpose}).json()["dev_code"]


def add_other_session(email: str = EMAIL) -> int:
    with Session(engine) as db:
        user = db.scalar(select(User).where(User.email == email))
        db.add(UserSession(user_id=user.id, token_hash=f"other-{utcnow().timestamp()}",
                           expires_at=utcnow() + timedelta(days=1), created_at=utcnow()))
        db.commit()
        return user.id


def session_count(user_id: int) -> int:
    with Session(engine) as db:
        return db.scalar(select(func.count(UserSession.id)).where(UserSession.user_id == user_id))


def test_set_password_then_login_with_it(client):
    login(client, legacy=True)
    assert client.get("/api/auth/me").json()["user"]["has_password"] is False
    res = client.put("/api/auth/password", json={"new_password": "raccoon-123"})
    assert res.status_code == 200 and res.json()["has_password"] is True
    with Session(engine) as db:  # 密码只存哈希
        assert "raccoon-123" not in db.scalar(select(User.password_hash).where(User.email == EMAIL))

    client.post("/api/auth/logout")
    bad = client.post("/api/auth/password-login", json={"email": EMAIL, "password": "nope-nope"})
    assert bad.status_code == 400
    ok = client.post("/api/auth/password-login", json={"email": "FAN@example.com", "password": "raccoon-123"})
    assert ok.status_code == 200
    assert client.get("/api/auth/me").json()["user"]["email"] == EMAIL


def test_password_login_unknown_or_passwordless_account(client):
    res = client.post("/api/auth/password-login", json={"email": "ghost@example.com", "password": "whatever1"})
    assert res.status_code == 400
    login(client, legacy=True)  # 有账号但没设密码
    client.post("/api/auth/logout")
    res2 = client.post("/api/auth/password-login", json={"email": EMAIL, "password": "whatever1"})
    assert res2.status_code == 400 and res2.json()["detail"] == res.json()["detail"]


def test_change_password_needs_current_and_revokes_other_sessions(client):
    login(client, legacy=True)
    client.put("/api/auth/password", json={"new_password": "first-pass"})
    assert client.put("/api/auth/password", json={"new_password": "second-pass"}).status_code == 400
    assert client.put("/api/auth/password",
                      json={"current_password": "wrong-pass", "new_password": "second-pass"}).status_code == 400
    user_id = add_other_session()
    assert session_count(user_id) == 2
    res = client.put("/api/auth/password", json={"current_password": "first-pass", "new_password": "second-pass"})
    assert res.status_code == 200
    assert session_count(user_id) == 1
    assert client.get("/api/auth/me").json()["user"] is not None  # 当前设备还登录着


def test_password_rules(client):
    assert client.put("/api/auth/password", json={"new_password": "longenough"}).status_code == 401
    login(client)
    assert client.put("/api/auth/password", json={"new_password": "short"}).status_code == 422


def test_lockout_after_repeated_failures(client):
    login(client, legacy=True)
    client.put("/api/auth/password", json={"new_password": "right-pass"})
    client.post("/api/auth/logout")
    for _ in range(5):
        assert client.post("/api/auth/password-login", json={"email": EMAIL, "password": "wrong-pass"}).status_code == 400
    res = client.post("/api/auth/password-login", json={"email": EMAIL, "password": "right-pass"})
    assert res.status_code == 429
    # 锁定期间验证码登录不受影响
    code = fresh_code(client)
    assert client.post("/api/auth/login", json={"email": EMAIL, "code": code}).status_code == 200


def test_forgot_password_resets_with_email_code(client):
    login(client, legacy=True)
    client.put("/api/auth/password", json={"new_password": "forgotten-1"})
    user_id = add_other_session()
    client.post("/api/auth/logout")

    code = fresh_code(client, purpose="reset")
    assert client.post("/api/auth/password-reset",
                       json={"email": EMAIL, "code": "000000" if code != "000000" else "111111",
                             "new_password": "brand-new-1"}).status_code == 400
    res = client.post("/api/auth/password-reset", json={"email": EMAIL, "code": code, "new_password": "brand-new-1"})
    assert res.status_code == 200
    assert client.get("/api/auth/me").json()["user"]["email"] == EMAIL  # 重设完直接登录
    assert session_count(user_id) == 1  # 其他设备被踢掉
    # 验证码只能用一次
    assert client.post("/api/auth/password-reset",
                       json={"email": EMAIL, "code": code, "new_password": "again-new-1"}).status_code == 400

    client.post("/api/auth/logout")
    assert client.post("/api/auth/password-login", json={"email": EMAIL, "password": "forgotten-1"}).status_code == 400
    assert client.post("/api/auth/password-login", json={"email": EMAIL, "password": "brand-new-1"}).status_code == 200
