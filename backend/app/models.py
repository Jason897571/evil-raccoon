from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def utcnow() -> datetime:
    """数据库里统一存不带时区的 UTC 时间。"""
    return datetime.now(UTC).replace(tzinfo=None)


class Pack(Base):
    """一个特效包，对应爱发电上的一个商品。"""

    __tablename__ = "packs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(64), unique=True)
    name: Mapped[str] = mapped_column(String(64))  # 时间、召唤兽 2
    element: Mapped[str] = mapped_column(String(16), index=True)  # 筛选用：时间、召唤、血……
    price_cents: Mapped[int] = mapped_column(Integer)
    summary: Mapped[str] = mapped_column(Text)
    cover_url: Mapped[str] = mapped_column(String(255))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_new: Mapped[bool] = mapped_column(Boolean, default=False)
    afdian_plan_id: Mapped[str | None] = mapped_column(String(64))
    source_dir: Mapped[str] = mapped_column(String(64))  # pixel-skill/release 下的目录名
    # 付款后才给用户看
    netdisk_url: Mapped[str | None] = mapped_column(String(512))
    netdisk_code: Mapped[str | None] = mapped_column(String(32))
    is_published: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")  # 上下架
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    skills: Mapped[list["Skill"]] = relationship(
        back_populates="pack", order_by="Skill.sort_order", cascade="all, delete-orphan"
    )


class Skill(Base):
    """特效包里的一个技能。"""

    __tablename__ = "skills"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    pack_id: Mapped[int] = mapped_column(ForeignKey("packs.id", ondelete="CASCADE"), index=True)
    sort_order: Mapped[int] = mapped_column(Integer)
    code: Mapped[str] = mapped_column(String(96))  # time_03_time_stop
    name: Mapped[str] = mapped_column(String(64))
    description: Mapped[str] = mapped_column(Text)
    phases: Mapped[str] = mapped_column(Text)  # spawn / loop / end
    preview_gif_url: Mapped[str] = mapped_column(String(255))  # 带水印
    sheet_url: Mapped[str] = mapped_column(String(255))  # 带水印，2 倍
    sheet_cols: Mapped[int] = mapped_column(Integer)
    sheet_rows: Mapped[int] = mapped_column(Integer)

    pack: Mapped[Pack] = relationship(back_populates="skills")


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True)
    display_name: Mapped[str | None] = mapped_column(String(40))  # 昵称，个人设置里改
    password_hash: Mapped[str | None] = mapped_column(String(255))  # 可选：没设密码的账号只能用验证码登录
    password_failures: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    password_locked_until: Mapped[datetime | None] = mapped_column(DateTime)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime)

    @property
    def has_password(self) -> bool:
        return bool(self.password_hash)


class LoginCode(Base):
    """邮箱验证码，只存哈希。"""

    __tablename__ = "login_codes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), index=True)
    code_hash: Mapped[str] = mapped_column(String(64))
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    used_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


class UserSession(Base):
    """登录会话。cookie 里放随机 token，数据库只存它的哈希。"""

    __tablename__ = "user_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    user: Mapped[User] = relationship()


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_no: Mapped[str] = mapped_column(String(32), unique=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    status: Mapped[str] = mapped_column(String(16), default="pending")  # pending / paid / cancelled
    total_cents: Mapped[int] = mapped_column(Integer)
    payment_method: Mapped[str | None] = mapped_column(String(32))  # mock / alipay / wechat
    payment_ref: Mapped[str | None] = mapped_column(String(128))  # 支付平台的交易号
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime)

    items: Mapped[list["OrderItem"]] = relationship(
        back_populates="order", order_by="OrderItem.id", cascade="all, delete-orphan"
    )


class OrderItem(Base):
    """下单时把名字和价格存一份快照，之后改价不影响旧订单。"""

    __tablename__ = "order_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    pack_id: Mapped[int] = mapped_column(ForeignKey("packs.id"), index=True)
    pack_name: Mapped[str] = mapped_column(String(64))
    price_cents: Mapped[int] = mapped_column(Integer)

    order: Mapped[Order] = relationship(back_populates="items")
    pack: Mapped[Pack] = relationship()


class SupportTier(Base):
    """每月发电（充电）档位，管理员在后台编辑。支持者选档位或自定义金额，走支付宝付款。"""

    __tablename__ = "support_tiers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(64))
    price_cents: Mapped[int] = mapped_column(Integer)  # 每月
    description: Mapped[str] = mapped_column(Text, default="")  # 一行一条权益
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


class ApiToken(Base):
    """管理员创建的 API token。明文只在创建时返回一次，库里只存哈希。"""

    __tablename__ = "api_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(64))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    prefix: Mapped[str] = mapped_column(String(16))  # 列表里显示前几位，方便认
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime)


class SupportPayment(Base):
    """一笔发电（支持）付款。可以按档位，也可以自定义金额；登录不是必须的。"""

    __tablename__ = "support_payments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    out_trade_no: Mapped[str] = mapped_column(String(32), unique=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    tier_id: Mapped[int | None] = mapped_column(ForeignKey("support_tiers.id", ondelete="SET NULL"))
    tier_name: Mapped[str | None] = mapped_column(String(64))  # 快照，档位改名 / 删除后照样能看
    amount_cents: Mapped[int] = mapped_column(Integer)
    supporter_name: Mapped[str | None] = mapped_column(String(32))
    message: Mapped[str | None] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(16), default="pending")  # pending / paid
    payment_method: Mapped[str | None] = mapped_column(String(32))  # alipay / mock
    payment_ref: Mapped[str | None] = mapped_column(String(128))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime)
