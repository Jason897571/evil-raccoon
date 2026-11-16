from dataclasses import dataclass

from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_session
from app.models import ApiToken, User, UserSession, utcnow
from app.security import digest

SESSION_COOKIE = "er_session"


def optional_user(request: Request, db: Session = Depends(get_session)) -> User | None:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        return None
    sess = db.scalar(select(UserSession).where(UserSession.token_hash == digest(token)))
    if sess is None or sess.expires_at <= utcnow():
        return None
    return sess.user


def current_user(user: User | None = Depends(optional_user)) -> User:
    if user is None:
        raise HTTPException(status_code=401, detail="请先登录")
    return user


def admin_user(user: User = Depends(current_user)) -> User:
    """只认登录的管理员（浏览器后台）。管理 token 这类敏感操作用它。"""
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="需要管理员权限")
    return user


@dataclass
class AdminActor:
    """管理接口的调用方：要么是登录的管理员，要么是一个 API token。"""

    user: User | None
    token: ApiToken | None


def admin_actor(
    request: Request,
    user: User | None = Depends(optional_user),
    db: Session = Depends(get_session),
) -> AdminActor:
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        raw = auth[7:].strip()
        token = db.scalar(select(ApiToken).where(ApiToken.token_hash == digest(raw)))
        if token is None or token.revoked_at is not None:
            raise HTTPException(status_code=401, detail="API token 无效或已吊销")
        token.last_used_at = utcnow()
        db.commit()
        return AdminActor(user=None, token=token)
    if user is None:
        raise HTTPException(status_code=401, detail="请先登录，或在请求头里带上 Authorization: Bearer <token>")
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="需要管理员权限")
    return AdminActor(user=user, token=None)
