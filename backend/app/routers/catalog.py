from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.catalog import ELEMENT_ORDER, HERO_TILES
from app.db import get_session
from app.models import Pack, Skill, SupportTier
from app.schemas import HeroTile, HomeOut, PackDetail, PackSummary, Stats, SupportInfo
from app.site_settings import ALIPAY_NOTE, ALIPAY_QR_URL, get_setting

router = APIRouter(prefix="/api", tags=["catalog"])


def to_summary(pack: Pack) -> PackSummary:
    return PackSummary(
        slug=pack.slug, name=pack.name, element=pack.element, price_cents=pack.price_cents,
        skill_count=len(pack.skills), cover_url=pack.cover_url, is_new=pack.is_new,
    )


def list_packs(db: Session) -> list[Pack]:
    """前台只看得到上架中的包。"""
    stmt = select(Pack).options(selectinload(Pack.skills)).where(Pack.is_published.is_(True)).order_by(Pack.sort_order)
    return list(db.scalars(stmt))


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/home", response_model=HomeOut)
def home(db: Session = Depends(get_session)) -> HomeOut:
    packs = list_packs(db)
    names = dict(db.execute(select(Skill.code, Skill.name).where(Skill.code.in_([c for _, c in HERO_TILES]))).all())
    hero = [
        HeroTile(label=label, skill_name=names.get(code, label), gif_url=f"/media/hero/{code}.gif")
        for label, code in HERO_TILES
    ]
    present = {p.element for p in packs}
    elements = [e for e in ELEMENT_ORDER if e in present]
    skill_total = db.scalar(select(func.count(Skill.id)).join(Pack).where(Pack.is_published.is_(True))) or 0
    return HomeOut(hero=hero, stats=Stats(packs=len(packs), skills=skill_total, elements=len(elements)), elements=elements)


@router.get("/packs", response_model=list[PackSummary])
def packs(element: str | None = None, db: Session = Depends(get_session)) -> list[PackSummary]:
    return [to_summary(p) for p in list_packs(db) if element is None or p.element == element]


@router.get("/packs/{slug}", response_model=PackDetail)
def pack_detail(slug: str, db: Session = Depends(get_session)) -> PackDetail:
    all_packs = list_packs(db)
    pack = next((p for p in all_packs if p.slug == slug), None)
    if pack is None:
        raise HTTPException(status_code=404, detail="特效包不存在")
    # 相关推荐：同元素的其他包优先，再按上架顺序补满 4 个
    others = [p for p in all_packs if p.slug != slug]
    others.sort(key=lambda p: (p.element != pack.element, p.sort_order))
    return PackDetail(
        **to_summary(pack).model_dump(),
        summary=pack.summary,
        skills=pack.skills,
        related=[to_summary(p) for p in others[:4]],
    )


def support_info(db: Session) -> SupportInfo:
    stmt = select(SupportTier).where(SupportTier.is_active.is_(True)).order_by(SupportTier.sort_order, SupportTier.id)
    return SupportInfo(
        alipay_qr_url=get_setting(db, ALIPAY_QR_URL),
        alipay_note=get_setting(db, ALIPAY_NOTE, "") or "",
        tiers=list(db.scalars(stmt)),
    )


@router.get("/support", response_model=SupportInfo)
def support(db: Session = Depends(get_session)) -> SupportInfo:
    return support_info(db)
