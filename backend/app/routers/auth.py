from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_session
from app.deps import SESSION_COOKIE, optional_user
from app.mailer import send_login_code
from app.models import LoginCode, User, UserSession, utcnow
from app.schemas import CodeRequest, CodeSent, LoginRequest, MeOut, UserOut
from app.security import digest, new_login_code, new_session_token, same_digest

router = APIRouter(prefix="/api/auth", tags=["auth"])

RESEND_SECONDS = 60
CODE_TTL = timedelta(minutes=10)
MAX_ATTEMPTS = 5
HOURLY_LIMIT = 10


@router.post("/code", response_model=CodeSent)
def send_code(body: CodeRequest, db: Session = Depends(get_session)) -> CodeSent:
    email = body.email.lower()
    now = utcnow()
    last = db.scalar(select(LoginCode).where(LoginCode.email == email).order_by(LoginCode.created_at.desc()).limit(1))
    if last and (wait := RESEND_SECONDS - int((now - last.created_at).total_seconds())) > 0:
        raise HTTPException(status_code=429, detail=f"请 {wait} 秒后再获取验证码")
    recent = db.scalar(
        select(func.count(LoginCode.id)).where(LoginCode.email == email, LoginCode.created_at > now - timedelta(hours=1))
    )
    if recent >= HOURLY_LIMIT:
        raise HTTPException(status_code=429, detail="验证码获取太频繁，请一小时后再试")

    code = new_login_code()
    try:
        send_login_code(email, code)
    except Exception as exc:  # SMTP 出错时别把半成品记录留在库里
        raise HTTPException(status_code=502, detail="验证码邮件发送失败，请稍后再试") from exc

    db.add(LoginCode(email=email, code_hash=digest(code), expires_at=now + CODE_TTL, created_at=now))
    db.commit()
    dev_code = code if settings.is_dev and not settings.smtp_host else None
    return CodeSent(resend_after=RESEND_SECONDS, dev_code=dev_code)


@router.post("/login", response_model=UserOut)
def login(body: LoginRequest, response: Response, db: Session = Depends(get_session)) -> User:
    email = body.email.lower()
    now = utcnow()
    record = db.scalar(
        select(LoginCode)
        .where(LoginCode.email == email, LoginCode.used_at.is_(None))
        .order_by(LoginCode.created_at.desc())
        .limit(1)
    )
    if record is None or record.expires_at <= now:
        raise HTTPException(status_code=400, detail="验证码已失效，请重新获取")
    if record.attempts >= MAX_ATTEMPTS:
        raise HTTPException(status_code=400, detail="错误次数太多，请重新获取验证码")
    if not same_digest(body.code, record.code_hash):
        record.attempts += 1
        db.commit()
        raise HTTPException(status_code=400, detail="验证码不对，请检查后再试")

    record.used_at = now
    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        # 管理员只有一个：第一个注册的用户。之后注册的都是普通客户，系统里没有别的途径设管理员。
        is_first = (db.scalar(select(func.count(User.id))) or 0) == 0
        user = User(email=email, created_at=now, is_admin=is_first)
        db.add(user)
    user.last_login_at = now
    db.flush()

    token = new_session_token()
    expires = now + timedelta(days=settings.session_days)
    db.add(UserSession(user_id=user.id, token_hash=digest(token), expires_at=expires, created_at=now))
    db.commit()

    response.set_cookie(
        SESSION_COOKIE, token, max_age=settings.session_days * 86400,
        httponly=True, samesite="lax", secure=settings.cookie_secure, path="/",
    )
    return user


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response, db: Session = Depends(get_session)) -> None:
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        db.execute(delete(UserSession).where(UserSession.token_hash == digest(token)))
        db.commit()
    response.delete_cookie(SESSION_COOKIE, path="/")


@router.get("/me", response_model=MeOut)
def me(user: User | None = Depends(optional_user)) -> MeOut:
    return MeOut(user=UserOut.model_validate(user) if user else None, dev_tools=settings.is_dev)
