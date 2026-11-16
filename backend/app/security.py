import hashlib
import hmac
import secrets

from app.config import settings


def digest(value: str) -> str:
    """验证码和会话 token 入库前都用这个做 HMAC，数据库泄露也拿不到原值。"""
    return hmac.new(settings.secret_key.encode(), value.encode(), hashlib.sha256).hexdigest()


def same_digest(value: str, expected: str) -> bool:
    return hmac.compare_digest(digest(value), expected)


def new_login_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def new_session_token() -> str:
    return secrets.token_urlsafe(32)
