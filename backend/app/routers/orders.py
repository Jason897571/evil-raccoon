import secrets

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app import alipay_client
from app.config import settings
from app.db import get_session
from app.deps import current_user
from app.models import Order, OrderItem, Pack, User, utcnow
from app.schemas import CreateOrder, LibraryItem, OrderItemOut, OrderOut, PayStart

router = APIRouter(prefix="/api", tags=["orders"])


def owned_pack_ids(db: Session, user_id: int) -> set[int]:
    stmt = (
        select(OrderItem.pack_id)
        .join(Order)
        .where(Order.user_id == user_id, Order.status == "paid")
    )
    return set(db.scalars(stmt))


def order_out(order: Order) -> OrderOut:
    return OrderOut(
        order_no=order.order_no, status=order.status, total_cents=order.total_cents,
        created_at=order.created_at, paid_at=order.paid_at,
        items=[
            OrderItemOut(slug=i.pack.slug, name=i.pack_name, price_cents=i.price_cents, cover_url=i.pack.cover_url)
            for i in order.items
        ],
    )


def new_order_no() -> str:
    return "ER" + utcnow().strftime("%Y%m%d%H%M%S") + f"{secrets.randbelow(10_000):04d}"


def get_own_order(db: Session, user: User, order_no: str) -> Order:
    order = db.scalar(
        select(Order)
        .options(selectinload(Order.items).selectinload(OrderItem.pack))
        .where(Order.order_no == order_no, Order.user_id == user.id)
    )
    if order is None:
        raise HTTPException(status_code=404, detail="订单不存在")
    return order


def mark_paid(db: Session, order: Order, method: str, ref: str | None) -> None:
    """付款成功的唯一入口。以后接支付宝 / 微信的回调也调这里。"""
    if order.status == "paid":
        return
    if order.status != "pending":
        raise HTTPException(status_code=409, detail="订单已取消，不能付款")
    owned = owned_pack_ids(db, order.user_id)
    if any(i.pack_id in owned for i in order.items):
        raise HTTPException(status_code=409, detail="订单里有你已经买过的特效包，请取消后重新下单")
    order.status = "paid"
    order.paid_at = utcnow()
    order.payment_method = method
    order.payment_ref = ref


@router.post("/orders", response_model=OrderOut, status_code=201)
def create_order(body: CreateOrder, user: User = Depends(current_user), db: Session = Depends(get_session)) -> OrderOut:
    slugs = list(dict.fromkeys(body.slugs))
    packs = {p.slug: p for p in db.scalars(select(Pack).where(Pack.slug.in_(slugs)))}
    missing = [s for s in slugs if s not in packs]
    if missing:
        raise HTTPException(status_code=404, detail=f"找不到特效包：{'、'.join(missing)}")
    offline = [packs[s].name for s in slugs if not packs[s].is_published]
    if offline:
        raise HTTPException(status_code=409, detail=f"已下架，暂时不能购买：{'、'.join(offline)}")
    owned = owned_pack_ids(db, user.id)
    already = [packs[s].name for s in slugs if packs[s].id in owned]
    if already:
        raise HTTPException(status_code=409, detail=f"你已经买过：{'、'.join(already)}")

    order = Order(
        order_no=new_order_no(), user_id=user.id, status="pending",
        total_cents=sum(packs[s].price_cents for s in slugs),
        items=[OrderItem(pack_id=packs[s].id, pack_name=packs[s].name, price_cents=packs[s].price_cents) for s in slugs],
    )
    db.add(order)
    db.commit()
    return order_out(get_own_order(db, user, order.order_no))


@router.get("/orders", response_model=list[OrderOut])
def list_orders(user: User = Depends(current_user), db: Session = Depends(get_session)) -> list[OrderOut]:
    orders = db.scalars(
        select(Order)
        .options(selectinload(Order.items).selectinload(OrderItem.pack))
        .where(Order.user_id == user.id)
        .order_by(Order.created_at.desc(), Order.id.desc())
    )
    return [order_out(o) for o in orders]


@router.get("/orders/{order_no}", response_model=OrderOut)
def get_order(order_no: str, user: User = Depends(current_user), db: Session = Depends(get_session)) -> OrderOut:
    return order_out(get_own_order(db, user, order_no))


@router.post("/orders/{order_no}/cancel", response_model=OrderOut)
def cancel_order(order_no: str, user: User = Depends(current_user), db: Session = Depends(get_session)) -> OrderOut:
    order = get_own_order(db, user, order_no)
    if order.status != "pending":
        raise HTTPException(status_code=409, detail="只能取消待付款的订单")
    order.status = "cancelled"
    order.cancelled_at = utcnow()
    db.commit()
    return order_out(order)


@router.post("/orders/{order_no}/pay", response_model=PayStart)
def pay_order(order_no: str, user: User = Depends(current_user), db: Session = Depends(get_session)) -> PayStart:
    """去支付宝付款：返回收银台地址，前端整页跳转过去。"""
    order = get_own_order(db, user, order_no)
    if order.status != "pending":
        raise HTTPException(status_code=409, detail="这个订单不是待付款状态")
    if not alipay_client.is_configured():
        raise HTTPException(status_code=503, detail="在线支付暂未开放")
    names = "、".join(i.pack_name for i in order.items)
    url = alipay_client.page_pay_url(
        order.order_no, order.total_cents, f"Evil Raccoon 像素特效：{names}",
        f"{settings.site_url}/orders/{order.order_no}",
    )
    return PayStart(out_trade_no=order.order_no, pay_url=url)


@router.post("/orders/{order_no}/sync", response_model=OrderOut)
def sync_order(order_no: str, user: User = Depends(current_user), db: Session = Depends(get_session)) -> OrderOut:
    """付完跳回订单页时调用：还没收到支付宝通知就主动查一次单。"""
    order = get_own_order(db, user, order_no)
    if order.status == "pending" and alipay_client.is_configured():
        paid, trade_no, amount = alipay_client.query_paid(order.order_no)
        if paid and alipay_client.amount_matches(amount, order.total_cents):
            mark_paid(db, order, "alipay", trade_no)
            db.commit()
    return order_out(order)


@router.post("/orders/{order_no}/mock-pay", response_model=OrderOut)
def mock_pay(order_no: str, user: User = Depends(current_user), db: Session = Depends(get_session)) -> OrderOut:
    """开发环境专用：模拟付款成功。正式环境这个接口不存在。"""
    if not settings.is_dev:
        raise HTTPException(status_code=404, detail="Not Found")
    order = get_own_order(db, user, order_no)
    mark_paid(db, order, "mock", None)
    db.commit()
    return order_out(order)


@router.get("/library", response_model=list[LibraryItem])
def library(user: User = Depends(current_user), db: Session = Depends(get_session)) -> list[LibraryItem]:
    rows = db.execute(
        select(OrderItem, Order, Pack)
        .join(Order, OrderItem.order_id == Order.id)
        .join(Pack, OrderItem.pack_id == Pack.id)
        .options(selectinload(Pack.skills))
        .where(Order.user_id == user.id, Order.status == "paid")
        .order_by(Order.paid_at.desc())
    ).all()
    seen: set[int] = set()
    items: list[LibraryItem] = []
    for _item, order, pack in rows:
        if pack.id in seen:
            continue
        seen.add(pack.id)
        items.append(LibraryItem(
            slug=pack.slug, name=pack.name, cover_url=pack.cover_url, skill_count=len(pack.skills),
            netdisk_url=pack.netdisk_url, netdisk_code=pack.netdisk_code,
            order_no=order.order_no, paid_at=order.paid_at,
        ))
    return items
