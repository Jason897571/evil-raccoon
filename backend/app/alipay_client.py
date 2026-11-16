"""支付宝电脑网站支付（alipay.trade.page.pay）的薄封装。

- 下单：生成跳转到支付宝收银台的 URL。
- 到账确认两条路：支付宝异步通知（notify，需要公网可达）+ 用户回到网站时主动查单（query）。
  域名还没通、通知进不来时，查单这条路一样能把订单标成已付款。
"""

import base64
import logging
from decimal import Decimal
from functools import lru_cache

from alipay import AliPay
from Cryptodome.PublicKey import RSA

from app.config import settings

log = logging.getLogger("uvicorn.error")

PAID_STATUSES = {"TRADE_SUCCESS", "TRADE_FINISHED"}


class AlipayNotConfigured(RuntimeError):
    pass


def to_pem(key: str) -> str:
    """密钥可能是完整 PEM，也可能是支付宝密钥工具导出的裸 base64（PKCS1 或 PKCS8 都行）。"""
    key = key.strip().replace("\\n", "\n")
    if "BEGIN" in key:
        return key
    return RSA.import_key(base64.b64decode("".join(key.split()))).export_key().decode()


def is_configured() -> bool:
    return bool(settings.alipay_app_id and settings.alipay_private_key and settings.alipay_public_key)


@lru_cache(maxsize=1)
def client() -> AliPay:
    if not is_configured():
        raise AlipayNotConfigured("支付宝还没配置")
    return AliPay(
        appid=settings.alipay_app_id,
        app_notify_url=settings.alipay_notify_url,
        app_private_key_string=to_pem(settings.alipay_private_key),
        alipay_public_key_string=to_pem(settings.alipay_public_key),
        sign_type="RSA2",
        debug=settings.alipay_sandbox,
    )


def yuan(cents: int) -> str:
    return f"{Decimal(cents) / 100:.2f}"


def page_pay_url(out_trade_no: str, amount_cents: int, subject: str, return_url: str) -> str:
    c = client()
    query = c.api_alipay_trade_page_pay(
        subject=subject[:128],
        out_trade_no=out_trade_no,
        total_amount=yuan(amount_cents),
        return_url=return_url,
        notify_url=settings.alipay_notify_url,
        timeout_express="30m",
    )
    return f"{c._gateway}?{query}"


def verify_notify(form: dict[str, str]) -> bool:
    data = dict(form)
    signature = data.pop("sign", "")
    data.pop("sign_type", None)
    try:
        return bool(signature) and client().verify(data, signature)
    except Exception:  # 签名格式异常一律当验签失败
        log.exception("支付宝通知验签出错")
        return False


def query_paid(out_trade_no: str) -> tuple[bool, str | None, str | None]:
    """主动查单。返回 (是否已付款, 支付宝交易号, 实付金额)。查询失败当作未付款。"""
    try:
        res = client().api_alipay_trade_query(out_trade_no=out_trade_no)
    except Exception:
        log.exception("支付宝查单失败 %s", out_trade_no)
        return False, None, None
    if res.get("code") != "10000":
        return False, None, None
    return res.get("trade_status") in PAID_STATUSES, res.get("trade_no"), res.get("total_amount")


def amount_matches(paid_amount: str | None, expected_cents: int) -> bool:
    try:
        return paid_amount is not None and Decimal(paid_amount) == Decimal(expected_cents) / 100
    except Exception:
        return False
