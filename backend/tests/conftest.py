from sqlalchemy.engine import make_url  # noqa: E402

from app.config import settings  # noqa: E402

# 必须在导入 app.db 之前改：测试用单独的库（开发库名加 _test，账号密码沿用 backend/.env），
# 开发模式，不发真邮件
_dev_url = make_url(settings.database_url)
settings.database_url = _dev_url.set(database=f"{_dev_url.database}_test").render_as_string(hide_password=False)
settings.app_env = "dev"
settings.smtp_host = None

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, delete, select, text  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.db import Base, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import (  # noqa: E402
    ApiToken, LoginCode, Order, OrderItem, Pack, Skill, SupportPayment, SupportTier, User, UserSession,
)


ADMIN_EMAIL = "boss@example.com"
TEST_PASSWORD = "test-pass-1"


@pytest.fixture(scope="session", autouse=True)
def schema():
    url = make_url(settings.database_url)
    server = create_engine(url.set(database=""))
    with server.connect() as conn:
        conn.execute(text(f"CREATE DATABASE IF NOT EXISTS `{url.database}` CHARACTER SET utf8mb4"))
    server.dispose()
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield
    Base.metadata.drop_all(engine)


@pytest.fixture(autouse=True)
def seed():
    with Session(engine) as db:
        for model in (SupportPayment, ApiToken, SupportTier, OrderItem, Order, UserSession, LoginCode, User, Skill, Pack):
            db.execute(delete(model))
        for i, (slug, name, price) in enumerate([("time", "时间", 2990), ("fire", "火焰", 1990), ("wind", "风", 990)]):
            pack = Pack(
                slug=slug, name=name, element=name, price_cents=price, summary="", cover_url=f"/media/covers/{slug}.jpg",
                sort_order=i, source_dir="x", netdisk_url=f"https://pan.example.com/{slug}", netdisk_code="abcd",
            )
            pack.skills.append(Skill(
                sort_order=0, code=f"{slug}_01", name="技能", description="", phases="spawn / loop / end",
                preview_gif_url="", sheet_url="", sheet_cols=1, sheet_rows=1,
            ))
            db.add(pack)
        # 站长：第一个注册的用户，也是唯一的管理员。其他测试里登录的都是普通客户。
        db.add(User(email=ADMIN_EMAIL, is_admin=True))
        db.add(SupportTier(name="邪恶小镰刀", price_cents=500, description="提前看作品", sort_order=0))
        db.add(SupportTier(name="隐藏档", price_cents=3000, description="", is_active=False, sort_order=1))
        db.commit()


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def login(client: TestClient, email: str = "fan@example.com", *, legacy: bool = False) -> None:
    """登录测试账号：没注册过就走注册（密码 TEST_PASSWORD），注册过就用验证码登录。

    legacy=True 先在库里建一个没密码的老账号（上线密码功能之前注册的用户），再用验证码登录。
    """
    with Session(engine) as db:
        exists = db.scalar(select(User.id).where(User.email == email)) is not None
        if legacy and not exists:
            db.add(User(email=email))
            db.commit()
            exists = True
    if exists:
        code = client.post("/api/auth/code", json={"email": email}).json()["dev_code"]
        res = client.post("/api/auth/login", json={"email": email, "code": code})
    else:
        code = client.post("/api/auth/code", json={"email": email, "purpose": "register"}).json()["dev_code"]
        res = client.post("/api/auth/register", json={"email": email, "code": code, "password": TEST_PASSWORD})
    assert res.status_code in (200, 201), res.text


def login_admin(client: TestClient) -> None:
    login(client, ADMIN_EMAIL)
