import base64
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


# 密码用标准库 scrypt：N=2^14, r=8 约占 16MB 内存，单次几十毫秒
_SCRYPT = {"n": 2**14, "r": 8, "p": 1}


def _scrypt(password: str, salt: bytes, n: int, r: int, p: int) -> bytes:
    return hashlib.scrypt(password.encode(), salt=salt, n=n, r=r, p=p, dklen=32)


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    key = _scrypt(password, salt, **_SCRYPT)
    b64 = lambda b: base64.b64encode(b).decode()  # noqa: E731
    return f"scrypt${_SCRYPT['n']}${_SCRYPT['r']}${_SCRYPT['p']}${b64(salt)}${b64(key)}"


def verify_password(password: str, stored: str | None) -> bool:
    """stored 为空（账号没设密码）时也算一次哈希再返回 False，让响应时间看不出账号有没有密码。"""
    if not stored:
        _scrypt(password, b"0" * 16, **_SCRYPT)
        return False
    try:
        _, n, r, p, salt, key = stored.split("$")
        actual = _scrypt(password, base64.b64decode(salt), int(n), int(r), int(p))
    except ValueError:
        return False
    return hmac.compare_digest(actual, base64.b64decode(key))
