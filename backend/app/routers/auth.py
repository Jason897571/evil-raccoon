from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_session
from app.deps import SESSION_COOKIE, current_user, optional_user
from app.mailer import send_login_code
from app.models import LoginCode, User, UserSession, utcnow
from app.schemas import (
    CodeRequest, CodeSent, LoginRequest, MeOut, PasswordChange, PasswordLogin, PasswordReset, RegisterRequest,
    UpdateMe, UserOut,
)
from app.security import digest, hash_password, new_login_code, new_session_token, same_digest, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])

RESEND_SECONDS = 60
CODE_TTL = timedelta(minutes=10)
MAX_ATTEMPTS = 5
HOURLY_LIMIT = 10
PASSWORD_MAX_FAILURES = 5
PASSWORD_LOCK = timedelta(minutes=15)


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
    registered = db.scalar(select(User.id).where(User.email == email)) is not None
    if body.purpose == "register" and registered:
        raise HTTPException(status_code=409, detail="这个邮箱已经注册过了，直接登录就行")
    if body.purpose != "register" and not registered:
        raise HTTPException(status_code=400, detail="这个邮箱还没注册，先去注册吧")

    code = new_login_code()
    try:
        send_login_code(email, code, body.purpose)
    except Exception as exc:  # SMTP 出错时别把半成品记录留在库里
        raise HTTPException(status_code=502, detail="验证码邮件发送失败，请稍后再试") from exc

    db.add(LoginCode(email=email, code_hash=digest(code), expires_at=now + CODE_TTL, created_at=now))
    db.commit()
    dev_code = code if settings.is_dev and not settings.smtp_host else None
    return CodeSent(resend_after=RESEND_SECONDS, dev_code=dev_code)


def _consume_code(db: Session, email: str, code: str, now: datetime) -> None:
    """核对邮箱验证码，对了就标记为已用；不对直接抛 400。"""
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
    if not same_digest(code, record.code_hash):
        record.attempts += 1
        db.commit()
        raise HTTPException(status_code=400, detail="验证码不对，请检查后再试")
    record.used_at = now


def _registered_user(db: Session, email: str) -> User:
    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        raise HTTPException(status_code=400, detail="这个邮箱还没注册，先去注册吧")
    return user


def _start_session(db: Session, user: User, response: Response, now: datetime) -> None:
    user.last_login_at = now
    token = new_session_token()
    expires = now + timedelta(days=settings.session_days)
    db.add(UserSession(user_id=user.id, token_hash=digest(token), expires_at=expires, created_at=now))
    db.commit()
    response.set_cookie(
        SESSION_COOKIE, token, max_age=settings.session_days * 86400,
        httponly=True, samesite="lax", secure=settings.cookie_secure, path="/",
    )


@router.post("/register", response_model=UserOut, status_code=201)
def register(body: RegisterRequest, response: Response, db: Session = Depends(get_session)) -> User:
    """注册：邮箱验证码 + 密码（+ 选填昵称），成功后直接登录。"""
    email = body.email.lower()
    now = utcnow()
    if db.scalar(select(User.id).where(User.email == email)):
        raise HTTPException(status_code=409, detail="这个邮箱已经注册过了，直接登录就行")
    _consume_code(db, email, body.code, now)
    # 管理员只有一个：第一个注册的用户。之后注册的都是普通客户，系统里没有别的途径设管理员。
    is_first = (db.scalar(select(func.count(User.id))) or 0) == 0
    user = User(
        email=email, created_at=now, is_admin=is_first, password_hash=hash_password(body.password),
        display_name=(body.display_name or "").strip() or None,
    )
    db.add(user)
    db.flush()
    _start_session(db, user, response, now)
    return user


@router.post("/login", response_model=UserOut)
def login(body: LoginRequest, response: Response, db: Session = Depends(get_session)) -> User:
    """验证码登录，只给已注册的账号用。"""
    email = body.email.lower()
    now = utcnow()
    user = _registered_user(db, email)
    _consume_code(db, email, body.code, now)
    _start_session(db, user, response, now)
    return user


@router.post("/password-login", response_model=UserOut)
def password_login(body: PasswordLogin, response: Response, db: Session = Depends(get_session)) -> User:
    email = body.email.lower()
    now = utcnow()
    user = db.scalar(select(User).where(User.email == email))
    if user and user.password_locked_until and user.password_locked_until > now:
        minutes = int((user.password_locked_until - now).total_seconds() // 60) + 1
        raise HTTPException(status_code=429, detail=f"密码错误次数太多，请 {minutes} 分钟后再试，或用验证码登录")
    if not verify_password(body.password, user.password_hash if user else None):
        if user and user.password_hash:
            user.password_failures += 1
            if user.password_failures >= PASSWORD_MAX_FAILURES:
                user.password_failures = 0
                user.password_locked_until = now + PASSWORD_LOCK
            db.commit()
        raise HTTPException(status_code=400, detail="邮箱或密码不对。没设过密码的账号请用验证码登录")
    user.password_failures = 0
    user.password_locked_until = None
    _start_session(db, user, response, now)
    return user


@router.post("/password-reset", response_model=UserOut)
def password_reset(body: PasswordReset, response: Response, db: Session = Depends(get_session)) -> User:
    """忘记密码：用邮箱验证码设新密码，顺便登录。其他设备上的登录全部失效。"""
    email = body.email.lower()
    now = utcnow()
    user = _registered_user(db, email)
    _consume_code(db, email, body.code, now)
    user.password_hash = hash_password(body.new_password)
    user.password_failures = 0
    user.password_locked_until = None
    db.execute(delete(UserSession).where(UserSession.user_id == user.id))
    _start_session(db, user, response, now)
    return user


@router.put("/password", response_model=UserOut)
def change_password(
    body: PasswordChange, request: Request, user: User = Depends(current_user), db: Session = Depends(get_session),
) -> User:
    """个人设置里设置 / 修改密码。已经有密码时要先输对当前密码；改完其他设备上的登录失效。"""
    if user.password_hash and not verify_password(body.current_password or "", user.password_hash):
        raise HTTPException(status_code=400, detail="当前密码不对。忘了的话可以用「忘记密码」通过邮箱重设")
    user.password_hash = hash_password(body.new_password)
    current = digest(request.cookies.get(SESSION_COOKIE, ""))
    db.execute(delete(UserSession).where(UserSession.user_id == user.id, UserSession.token_hash != current))
    db.commit()
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


@router.patch("/me", response_model=UserOut)
def update_me(body: UpdateMe, user: User = Depends(current_user), db: Session = Depends(get_session)) -> User:
    user.display_name = (body.display_name or "").strip() or None  # 留空 = 清除昵称
    db.commit()
    return user


@router.post("/logout-others")
def logout_others(request: Request, user: User = Depends(current_user), db: Session = Depends(get_session)) -> dict:
    """退出这个账号在其他浏览器 / 设备上的登录，保留当前这一个。"""
    current = digest(request.cookies.get(SESSION_COOKIE, ""))
    result = db.execute(
        delete(UserSession).where(UserSession.user_id == user.id, UserSession.token_hash != current)
    )
    db.commit()
    return {"revoked": result.rowcount}
