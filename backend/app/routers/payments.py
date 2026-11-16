"""发电（支持）付款 + 支付宝异步通知。

订单号前缀区分业务：ER 开头是特效包订单，ES 开头是发电。
"""

import secrets

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import PlainTextResponse
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app import alipay_client
from app.config import settings
from app.db import get_session
from app.deps import optional_user
from app.models import Order, OrderItem, SupportPayment, SupportTier, User, utcnow
from app.routers.orders import mark_paid
from app.schemas import PayStart, SupportInfo, SupportPaymentOut, SupportPayRequest

router = APIRouter(prefix="/api", tags=["payments"])


def pay_enabled() -> bool:
    return alipay_client.is_configured() or settings.is_dev


def new_support_no() -> str:
    return "ES" + utcnow().strftime("%Y%m%d%H%M%S") + f"{secrets.randbelow(1_000_000):06d}"


def mark_support_paid(payment: SupportPayment, method: str, ref: str | None) -> None:
    if payment.status == "paid":
        return
    payment.status = "paid"
    payment.paid_at = utcnow()
    payment.payment_method = method
    payment.payment_ref = ref


@router.get("/support", response_model=SupportInfo)
def support(db: Session = Depends(get_session)) -> SupportInfo:
    stmt = select(SupportTier).where(SupportTier.is_active.is_(True)).order_by(SupportTier.sort_order, SupportTier.id)
    return SupportInfo(pay_enabled=pay_enabled(), tiers=list(db.scalars(stmt)))


@router.post("/support/pay", response_model=PayStart, status_code=201)
def start_support(
    body: SupportPayRequest, user: User | None = Depends(optional_user), db: Session = Depends(get_session)
) -> PayStart:
    if (body.tier_id is None) == (body.amount_cents is None):
        raise HTTPException(status_code=422, detail="请选择一个档位，或者填写金额")
    tier = None
    if body.tier_id is not None:
        tier = db.get(SupportTier, body.tier_id)
        if tier is None or not tier.is_active:
            raise HTTPException(status_code=404, detail="这个档位已经下线了")
    amount = tier.price_cents if tier else body.amount_cents
    if not pay_enabled():
        raise HTTPException(status_code=503, detail="在线支付暂未开放")

    payment = SupportPayment(
        out_trade_no=new_support_no(), user_id=user.id if user else None,
        tier_id=tier.id if tier else None, tier_name=tier.name if tier else None, amount_cents=amount,
        supporter_name=(body.name or "").strip() or None, message=(body.message or "").strip() or None,
    )
    db.add(payment)
    result_path = f"/support/thanks?no={payment.out_trade_no}"
    if alipay_client.is_configured():
        subject = f"支持 Evil Raccoon · {tier.name}" if tier else "支持 Evil Raccoon"
        pay_url = alipay_client.page_pay_url(payment.out_trade_no, amount, subject, settings.site_url + result_path)
    else:  # 开发环境没配支付宝：直接当付款成功，方便本地走完流程
        mark_support_paid(payment, "mock", None)
        pay_url = result_path
    db.commit()
    return PayStart(out_trade_no=payment.out_trade_no, pay_url=pay_url)


@router.get("/support/payments/{out_trade_no}", response_model=SupportPaymentOut)
def support_payment(out_trade_no: str, db: Session = Depends(get_session)) -> SupportPayment:
    """付完跳回来时查结果。还没收到通知就主动去支付宝查一次。"""
    payment = db.scalar(select(SupportPayment).where(SupportPayment.out_trade_no == out_trade_no))
    if payment is None:
        raise HTTPException(status_code=404, detail="找不到这笔支付")
    if payment.status == "pending" and alipay_client.is_configured():
        paid, trade_no, amount = alipay_client.query_paid(out_trade_no)
        if paid and alipay_client.amount_matches(amount, payment.amount_cents):
            mark_support_paid(payment, "alipay", trade_no)
            db.commit()
    return payment


@router.post("/payments/alipay/notify", response_class=PlainTextResponse)
async def alipay_notify(request: Request, db: Session = Depends(get_session)) -> str:
    """支付宝异步通知。只有返回纯文本 success，支付宝才会停止重发。"""
    form = {k: str(v) for k, v in (await request.form()).items()}
    if not alipay_client.is_configured() or not alipay_client.verify_notify(form):
        return "failure"
    if form.get("app_id") != settings.alipay_app_id:
        return "failure"
    if form.get("trade_status") not in alipay_client.PAID_STATUSES:
        return "success"  # 其他状态（如 WAIT_BUYER_PAY）确认收到即可

    no, trade_no, amount = form.get("out_trade_no", ""), form.get("trade_no"), form.get("total_amount")
    if no.startswith("ER"):
        order = db.scalar(
            select(Order).options(selectinload(Order.items).selectinload(OrderItem.pack)).where(Order.order_no == no)
        )
        if order is None or not alipay_client.amount_matches(amount, order.total_cents):
            return "failure"
        try:
            mark_paid(db, order, "alipay", trade_no)
        except HTTPException:
            # 订单已取消或包已买过：钱收到了但不能重复发货，记日志人工处理，别让支付宝一直重发
            alipay_client.log.error("订单 %s 已付款但无法完成（%s），需要人工处理退款", no, trade_no)
            return "success"
    elif no.startswith("ES"):
        payment = db.scalar(select(SupportPayment).where(SupportPayment.out_trade_no == no))
        if payment is None or not alipay_client.amount_matches(amount, payment.amount_cents):
            return "failure"
        mark_support_paid(payment, "alipay", trade_no)
    else:
        return "failure"
    db.commit()
    return "success"
