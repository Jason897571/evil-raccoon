"""管理接口。

- 特效包、充电档位：登录的管理员或 API token 都能调（Authorization: Bearer <token>）。
- token 本身的创建 / 吊销：只能由登录的管理员在后台操作，token 不能再生 token。
"""

import secrets

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.db import get_session
from app.deps import AdminActor, admin_actor, admin_user
from app.models import ApiToken, Pack, Skill, SupportPayment, SupportTier, User, utcnow
from app.schemas import (
    AdminPack, AdminSkill, PackPatch, SkillPatch, SupportPaymentOut, TierIn, TierOut, TierPatch, TokenCreate,
    TokenCreated, TokenOut,
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


@router.get("/packs", response_model=list[AdminPack])
def list_packs(_: AdminActor = Depends(admin_actor), db: Session = Depends(get_session)) -> list[Pack]:
    return list(db.scalars(select(Pack).options(selectinload(Pack.skills)).order_by(Pack.sort_order)))


@router.get("/packs/{slug}", response_model=AdminPack)
def read_pack(slug: str, _: AdminActor = Depends(admin_actor), db: Session = Depends(get_session)) -> Pack:
    return get_pack(db, slug)


@router.patch("/packs/{slug}", response_model=AdminPack)
def update_pack(
    slug: str, body: PackPatch, _: AdminActor = Depends(admin_actor), db: Session = Depends(get_session)
) -> Pack:
    pack = get_pack(db, slug)
    apply_patch(pack, body, NULLABLE_PACK)
    db.commit()
    return get_pack(db, slug)


@router.patch("/packs/{slug}/skills/{code}", response_model=AdminSkill)
def update_skill(
    slug: str, code: str, body: SkillPatch, _: AdminActor = Depends(admin_actor), db: Session = Depends(get_session)
) -> Skill:
    pack = get_pack(db, slug)
    skill = next((s for s in pack.skills if s.code == code), None)
    if skill is None:
        raise HTTPException(status_code=404, detail="技能不存在")
    apply_patch(skill, body, set())
    db.commit()
    return skill


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
