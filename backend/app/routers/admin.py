"""管理接口。

- 特效包（含技能、上传图片）、首屏动图、充电档位：登录的管理员或 API token 都能调（Authorization: Bearer <token>）。
- 用户资料：只有登录的管理员能看，token 不行。
- token 本身的创建 / 吊销：只能由登录的管理员在后台操作，token 不能再生 token。
"""

import secrets
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session, selectinload

from app.config import settings
from app.db import get_session
from app.deps import AdminActor, admin_actor, admin_user
from app.models import (
    ApiToken, HeroSlot, Order, OrderItem, Pack, Skill, SupportPayment, SupportTier, User, UserSession, utcnow,
)
from app.routers.orders import order_out
from app.schemas import (
    AdminHeroSlot, AdminOwnedPack, AdminPack, AdminSkill, AdminUserDetail, AdminUserRow, HeroUpdate, PackCreate,
    PackPatch, SkillCreate,
    SkillPatch, SupportPaymentOut, TierIn, TierOut, TierPatch, TokenCreate, TokenCreated, TokenOut, UploadOut,
)
from app.security import digest

router = APIRouter(prefix="/api/admin", tags=["admin"])

TOKEN_PREFIX = "er_"
NULLABLE_PACK = {"netdisk_url", "netdisk_code"}
NULLABLE_TIER: set[str] = set()


def apply_patch(obj: object, patch: BaseModel, nullable: set[str]) -> None:
    """只改请求里出现的字段；不允许把必填字段设成 null。"""
    for key, value in patch.model_dump(exclude_unset=True).items():
        if value is None and key not in nullable:
            raise HTTPException(status_code=422, detail=f"{key} 不能为空")
        if isinstance(value, str) and key in nullable:
            value = value.strip() or None
        setattr(obj, key, value)


# ---------- 特效包 ----------

def get_pack(db: Session, slug: str) -> Pack:
    pack = db.scalar(select(Pack).options(selectinload(Pack.skills)).where(Pack.slug == slug))
    if pack is None:
        raise HTTPException(status_code=404, detail="特效包不存在")
    return pack


def sold_counts(db: Session) -> dict[int, int]:
    rows = db.execute(
        select(OrderItem.pack_id, func.count(OrderItem.id))
        .join(Order, OrderItem.order_id == Order.id)
        .where(Order.status == "paid")
        .group_by(OrderItem.pack_id)
    )
    return {pack_id: n for pack_id, n in rows}


def to_admin_pack(pack: Pack, sold: dict[int, int]) -> AdminPack:
    out = AdminPack.model_validate(pack)
    out.skill_count = len(pack.skills)
    out.sold_count = sold.get(pack.id, 0)
    return out


@router.get("/packs", response_model=list[AdminPack])
def list_packs(_: AdminActor = Depends(admin_actor), db: Session = Depends(get_session)) -> list[AdminPack]:
    sold = sold_counts(db)
    packs = db.scalars(select(Pack).options(selectinload(Pack.skills)).order_by(Pack.sort_order, Pack.id))
    return [to_admin_pack(p, sold) for p in packs]


@router.get("/packs/{slug}", response_model=AdminPack)
def read_pack(slug: str, _: AdminActor = Depends(admin_actor), db: Session = Depends(get_session)) -> AdminPack:
    return to_admin_pack(get_pack(db, slug), sold_counts(db))


@router.post("/packs", response_model=AdminPack, status_code=201)
def create_pack(body: PackCreate, _: AdminActor = Depends(admin_actor), db: Session = Depends(get_session)) -> AdminPack:
    if db.scalar(select(Pack.id).where(Pack.slug == body.slug)):
        raise HTTPException(status_code=409, detail=f"slug「{body.slug}」已经被用了")
    data = body.model_dump()
    for key in NULLABLE_PACK:
        data[key] = (data[key] or "").strip() or None
    db.add(Pack(**data, source_dir=""))
    db.commit()
    return to_admin_pack(get_pack(db, body.slug), {})


@router.patch("/packs/{slug}", response_model=AdminPack)
def update_pack(
    slug: str, body: PackPatch, _: AdminActor = Depends(admin_actor), db: Session = Depends(get_session)
) -> AdminPack:
    pack = get_pack(db, slug)
    apply_patch(pack, body, NULLABLE_PACK)
    db.commit()
    return to_admin_pack(get_pack(db, slug), sold_counts(db))


@router.delete("/packs/{slug}", status_code=204)
def delete_pack(slug: str, _: AdminActor = Depends(admin_actor), db: Session = Depends(get_session)) -> None:
    pack = get_pack(db, slug)
    orders = db.scalar(select(func.count(OrderItem.id)).where(OrderItem.pack_id == pack.id)) or 0
    if orders:
        # 订单里存着这个包，删了买家的「我的素材」就没了；只能下架
        raise HTTPException(status_code=409, detail=f"已经有 {orders} 笔订单买过这个包，不能删除，可以改成下架")
    db.delete(pack)
    db.commit()


def get_skill(pack: Pack, code: str) -> Skill:
    skill = next((s for s in pack.skills if s.code == code), None)
    if skill is None:
        raise HTTPException(status_code=404, detail="技能不存在")
    return skill


@router.post("/packs/{slug}/skills", response_model=AdminSkill, status_code=201)
def create_skill(
    slug: str, body: SkillCreate, _: AdminActor = Depends(admin_actor), db: Session = Depends(get_session)
) -> Skill:
    pack = get_pack(db, slug)
    if any(s.code == body.code for s in pack.skills):
        raise HTTPException(status_code=409, detail=f"这个包里已经有技能「{body.code}」")
    skill = Skill(**body.model_dump(), sort_order=max((s.sort_order for s in pack.skills), default=0) + 1)
    pack.skills.append(skill)
    db.commit()
    return skill


@router.patch("/packs/{slug}/skills/{code}", response_model=AdminSkill)
def update_skill(
    slug: str, code: str, body: SkillPatch, _: AdminActor = Depends(admin_actor), db: Session = Depends(get_session)
) -> Skill:
    skill = get_skill(get_pack(db, slug), code)
    apply_patch(skill, body, set())
    db.commit()
    return skill


@router.delete("/packs/{slug}/skills/{code}", status_code=204)
def delete_skill(
    slug: str, code: str, _: AdminActor = Depends(admin_actor), db: Session = Depends(get_session)
) -> None:
    pack = get_pack(db, slug)
    pack.skills.remove(get_skill(pack, code))
    db.commit()


# ---------- 首屏 12 格 ----------

def hero_slots(db: Session) -> list[AdminHeroSlot]:
    slots = db.scalars(
        select(HeroSlot).options(selectinload(HeroSlot.skill).selectinload(Skill.pack)).order_by(HeroSlot.position)
    )
    return [
        AdminHeroSlot(
            position=s.position, label=s.label, gif_url=s.gif_url,
            skill_code=s.skill.code if s.skill else None, skill_name=s.skill.name if s.skill else None,
            pack_slug=s.skill.pack.slug if s.skill else None, pack_name=s.skill.pack.name if s.skill else None,
            pack_published=s.skill.pack.is_published if s.skill else None,
        )
        for s in slots
    ]


@router.get("/hero", response_model=list[AdminHeroSlot])
def read_hero(_: AdminActor = Depends(admin_actor), db: Session = Depends(get_session)) -> list[AdminHeroSlot]:
    return hero_slots(db)


@router.put("/hero", response_model=list[AdminHeroSlot])
def update_hero(body: HeroUpdate, _: AdminActor = Depends(admin_actor), db: Session = Depends(get_session)) -> list[AdminHeroSlot]:
    """整体替换首屏 12 格。每格选一个技能（动图默认用它的预览 GIF），或者只填标签 + 自己上传的 GIF。"""
    codes = {s.skill_code for s in body.slots if s.skill_code}
    skills = {s.code: s for s in db.scalars(select(Skill).where(Skill.code.in_(codes)))} if codes else {}
    if missing := sorted(codes - skills.keys()):
        raise HTTPException(status_code=422, detail=f"找不到这些技能：{'、'.join(missing)}")
    for i, s in enumerate(body.slots, start=1):
        skill = skills.get(s.skill_code) if s.skill_code else None
        if not s.gif_url.strip() and not (skill and skill.preview_gif_url):
            raise HTTPException(status_code=422, detail=f"第 {i} 格没有动图：选一个有预览图的技能，或者上传一张 GIF")
    db.execute(delete(HeroSlot))
    db.flush()
    for position, s in enumerate(body.slots):
        skill = skills.get(s.skill_code) if s.skill_code else None
        gif = s.gif_url.strip() or skill.preview_gif_url  # 上面已保证两者至少有一个
        db.add(HeroSlot(position=position, label=s.label.strip(), skill_id=skill.id if skill else None, gif_url=gif))
    db.commit()
    return hero_slots(db)


# ---------- 上传图片 ----------

MAX_UPLOAD = 5 * 1024 * 1024
IMAGE_TYPES = {b"\x89PNG": "png", b"GIF8": "gif", b"\xff\xd8\xff": "jpg"}


def image_ext(head: bytes) -> str | None:
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "webp"
    return next((ext for magic, ext in IMAGE_TYPES.items() if head.startswith(magic)), None)


@router.post("/uploads", response_model=UploadOut, status_code=201)
async def upload_image(file: UploadFile, _: AdminActor = Depends(admin_actor)) -> UploadOut:
    """封面、技能 GIF、精灵图都走这里，存到 media/uploads/年月/ 下，返回 /media/... 地址。"""
    data = await file.read(MAX_UPLOAD + 1)
    if len(data) > MAX_UPLOAD:
        raise HTTPException(status_code=413, detail="图片不能超过 5MB")
    ext = image_ext(data[:12])
    if ext is None:
        raise HTTPException(status_code=415, detail="只支持 PNG、GIF、JPG、WebP 图片")
    sub = Path("uploads") / utcnow().strftime("%Y%m")
    (settings.media_dir / sub).mkdir(parents=True, exist_ok=True)
    name = f"{secrets.token_hex(8)}.{ext}"
    (settings.media_dir / sub / name).write_bytes(data)
    return UploadOut(url=f"/media/{sub.as_posix()}/{name}")


# ---------- 用户（只给登录的管理员看，API token 不能读用户资料） ----------

def user_rows(db: Session, users: list[User]) -> list[AdminUserRow]:
    ids = [u.id for u in users]
    if not ids:
        return []
    paid = {uid: (n, total) for uid, n, total in db.execute(
        select(Order.user_id, func.count(Order.id), func.coalesce(func.sum(Order.total_cents), 0))
        .where(Order.user_id.in_(ids), Order.status == "paid")
        .group_by(Order.user_id)
    )}
    support = {uid: total for uid, total in db.execute(
        select(SupportPayment.user_id, func.coalesce(func.sum(SupportPayment.amount_cents), 0))
        .where(SupportPayment.user_id.in_(ids), SupportPayment.status == "paid")
        .group_by(SupportPayment.user_id)
    )}
    return [
        AdminUserRow(
            id=u.id, email=u.email, display_name=u.display_name, is_admin=u.is_admin, has_password=u.has_password,
            created_at=u.created_at, last_login_at=u.last_login_at,
            paid_order_count=paid.get(u.id, (0, 0))[0], paid_cents=int(paid.get(u.id, (0, 0))[1]),
            support_cents=int(support.get(u.id, 0)),
        )
        for u in users
    ]


def get_user(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="用户不存在")
    return user


@router.get("/users", response_model=list[AdminUserRow])
def list_users(
    q: str | None = None, _: User = Depends(admin_user), db: Session = Depends(get_session)
) -> list[AdminUserRow]:
    stmt = select(User).order_by(User.created_at.desc()).limit(500)
    if q and q.strip():
        like = f"%{q.strip()}%"
        stmt = stmt.where(User.email.like(like) | User.display_name.like(like))
    return user_rows(db, list(db.scalars(stmt)))


@router.get("/users/{user_id}", response_model=AdminUserDetail)
def read_user(user_id: int, _: User = Depends(admin_user), db: Session = Depends(get_session)) -> AdminUserDetail:
    user = get_user(db, user_id)
    now = utcnow()
    orders = list(db.scalars(
        select(Order).options(selectinload(Order.items).selectinload(OrderItem.pack))
        .where(Order.user_id == user.id).order_by(Order.created_at.desc())
    ))
    owned: list[AdminOwnedPack] = []
    seen: set[int] = set()
    for order in sorted((o for o in orders if o.status == "paid"), key=lambda o: o.paid_at or o.created_at, reverse=True):
        for item in order.items:
            if item.pack_id not in seen:
                seen.add(item.pack_id)
                owned.append(AdminOwnedPack(slug=item.pack.slug, name=item.pack.name, cover_url=item.pack.cover_url,
                                            order_no=order.order_no, paid_at=order.paid_at))
    payments = list(db.scalars(
        select(SupportPayment).where(SupportPayment.user_id == user.id).order_by(SupportPayment.created_at.desc())
    ))
    sessions = list(db.scalars(
        select(UserSession).where(UserSession.user_id == user.id, UserSession.expires_at > now)
    ))
    locked = user.password_locked_until if user.password_locked_until and user.password_locked_until > now else None
    return AdminUserDetail(
        user=user_rows(db, [user])[0],
        password_locked_until=locked,
        password_failures=user.password_failures,
        session_count=len(sessions),
        last_session_at=max((s.created_at for s in sessions), default=None),
        pending_order_count=sum(o.status == "pending" for o in orders),
        support_count=sum(p.status == "paid" for p in payments),
        orders=[order_out(o) for o in orders],
        owned=owned,
        support_payments=[SupportPaymentOut.model_validate(p) for p in payments],
    )


@router.post("/users/{user_id}/logout-all")
def logout_user(user_id: int, me: User = Depends(admin_user), db: Session = Depends(get_session)) -> dict:
    """强制下线：删掉这个用户所有登录会话。管理员自己请用个人设置里的「退出其他设备」。"""
    user = get_user(db, user_id)
    if user.id == me.id:
        raise HTTPException(status_code=400, detail="不能对自己用，请在个人设置里退出其他设备")
    result = db.execute(delete(UserSession).where(UserSession.user_id == user.id))
    db.commit()
    return {"revoked": result.rowcount}


# ---------- 充电档位 ----------

def get_tier(db: Session, tier_id: int) -> SupportTier:
    tier = db.get(SupportTier, tier_id)
    if tier is None:
        raise HTTPException(status_code=404, detail="档位不存在")
    return tier


@router.get("/tiers", response_model=list[TierOut])
def list_tiers(_: AdminActor = Depends(admin_actor), db: Session = Depends(get_session)) -> list[SupportTier]:
    return list(db.scalars(select(SupportTier).order_by(SupportTier.sort_order, SupportTier.id)))


@router.post("/tiers", response_model=TierOut, status_code=201)
def create_tier(body: TierIn, _: AdminActor = Depends(admin_actor), db: Session = Depends(get_session)) -> SupportTier:
    tier = SupportTier(**body.model_dump())
    db.add(tier)
    db.commit()
    return tier


@router.patch("/tiers/{tier_id}", response_model=TierOut)
def update_tier(
    tier_id: int, body: TierPatch, _: AdminActor = Depends(admin_actor), db: Session = Depends(get_session)
) -> SupportTier:
    tier = get_tier(db, tier_id)
    apply_patch(tier, body, NULLABLE_TIER)
    db.commit()
    return tier


@router.delete("/tiers/{tier_id}", status_code=204)
def delete_tier(tier_id: int, _: AdminActor = Depends(admin_actor), db: Session = Depends(get_session)) -> None:
    db.delete(get_tier(db, tier_id))
    db.commit()


# ---------- 发电记录 ----------

@router.get("/support/payments", response_model=list[SupportPaymentOut])
def support_payments(
    status: str | None = "paid", _: AdminActor = Depends(admin_actor), db: Session = Depends(get_session)
) -> list[SupportPayment]:
    """默认只看已付款的；?status=pending 看没付完的，?status= 看全部。"""
    stmt = select(SupportPayment).order_by(SupportPayment.created_at.desc()).limit(500)
    if status:
        stmt = stmt.where(SupportPayment.status == status)
    return list(db.scalars(stmt))


# ---------- API token（只能在登录的后台里管理） ----------

@router.get("/tokens", response_model=list[TokenOut])
def list_tokens(_: User = Depends(admin_user), db: Session = Depends(get_session)) -> list[ApiToken]:
    return list(db.scalars(select(ApiToken).order_by(ApiToken.created_at.desc(), ApiToken.id.desc())))


@router.post("/tokens", response_model=TokenCreated, status_code=201)
def create_token(body: TokenCreate, user: User = Depends(admin_user), db: Session = Depends(get_session)) -> TokenCreated:
    raw = TOKEN_PREFIX + secrets.token_urlsafe(32)
    token = ApiToken(name=body.name.strip(), token_hash=digest(raw), prefix=raw[:10], created_by=user.id)
    db.add(token)
    db.commit()
    return TokenCreated(
        id=token.id, name=token.name, prefix=token.prefix, created_at=token.created_at,
        last_used_at=None, revoked_at=None, token=raw,
    )


@router.post("/tokens/{token_id}/revoke", response_model=TokenOut)
def revoke_token(token_id: int, _: User = Depends(admin_user), db: Session = Depends(get_session)) -> ApiToken:
    token = db.get(ApiToken, token_id)
    if token is None:
        raise HTTPException(status_code=404, detail="token 不存在")
    if token.revoked_at is None:
        token.revoked_at = utcnow()
        db.commit()
    return token
