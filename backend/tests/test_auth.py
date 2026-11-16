from datetime import timedelta

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.db import engine
from app.models import LoginCode
from tests.conftest import login


def test_login_with_code_sets_session(client):
    res = client.post("/api/auth/code", json={"email": "Fan@Example.com"})
    assert res.status_code == 200
    code = res.json()["dev_code"]
    assert len(code) == 6

    assert client.get("/api/auth/me").json()["user"] is None
    res = client.post("/api/auth/login", json={"email": "fan@example.com", "code": code})
    assert res.status_code == 200
    assert res.json() == {"email": "fan@example.com", "is_admin": False}
    assert "er_session" in res.cookies

    me = client.get("/api/auth/me").json()
    assert me["user"] == {"email": "fan@example.com", "is_admin": False}
    assert me["dev_tools"] is True


def test_code_is_single_use(client):
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
    assert client.post("/api/auth/code", json={"email": "b@example.com"}).status_code == 200
    res = client.post("/api/auth/code", json={"email": "b@example.com"})
    assert res.status_code == 429
    assert "秒后" in res.json()["detail"]


def test_wrong_code_locks_after_five_attempts(client):
    code = client.post("/api/auth/code", json={"email": "c@example.com"}).json()["dev_code"]
    wrong = "000000" if code != "000000" else "111111"
    for _ in range(5):
        assert client.post("/api/auth/login", json={"email": "c@example.com", "code": wrong}).status_code == 400
    res = client.post("/api/auth/login", json={"email": "c@example.com", "code": code})
    assert res.status_code == 400
    assert "次数" in res.json()["detail"]


def test_expired_code_rejected(client):
    code = client.post("/api/auth/code", json={"email": "d@example.com"}).json()["dev_code"]
    with Session(engine) as db:
        rec = db.scalar(select(LoginCode).where(LoginCode.email == "d@example.com"))
        db.execute(update(LoginCode).where(LoginCode.id == rec.id).values(expires_at=rec.created_at - timedelta(seconds=1)))
        db.commit()
    res = client.post("/api/auth/login", json={"email": "d@example.com", "code": code})
    assert res.status_code == 400
    assert "失效" in res.json()["detail"]


def test_invalid_email_rejected(client):
    assert client.post("/api/auth/code", json={"email": "not-an-email"}).status_code == 422
