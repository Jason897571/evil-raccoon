from datetime import UTC, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, PlainSerializer

# 数据库里是不带时区的 UTC，输出时补上时区，前端按本地时间显示
UtcDatetime = Annotated[datetime, PlainSerializer(lambda d: d.replace(tzinfo=UTC).isoformat(), return_type=str)]


class SkillOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    code: str
    name: str
    description: str
    phases: str
    preview_gif_url: str
    sheet_url: str
    sheet_cols: int
    sheet_rows: int


class PackSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    slug: str
    name: str
    element: str
    price_cents: int
    skill_count: int
    cover_url: str
    is_new: bool


class PackDetail(PackSummary):
    summary: str
    skills: list[SkillOut]
    related: list[PackSummary]


class HeroTile(BaseModel):
    label: str
    skill_name: str
    gif_url: str


class Stats(BaseModel):
    packs: int
    skills: int
    elements: int


class HomeOut(BaseModel):
    hero: list[HeroTile]
    stats: Stats
    elements: list[str]


# ---------- 登录 ----------

class CodeRequest(BaseModel):
    email: EmailStr


class CodeSent(BaseModel):
    sent: bool = True
    resend_after: int  # 秒
    dev_code: str | None = None  # 只在开发环境、没配 SMTP 时返回


class LoginRequest(BaseModel):
    email: EmailStr
    code: str = Field(pattern=r"^\d{6}$")


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    email: str
    is_admin: bool


class MeOut(BaseModel):
    user: UserOut | None
    dev_tools: bool  # 前端据此显示模拟支付按钮


# ---------- 订单 ----------

class CreateOrder(BaseModel):
    slugs: list[str] = Field(min_length=1, max_length=50)


class OrderItemOut(BaseModel):
    slug: str
    name: str
    price_cents: int
    cover_url: str


class OrderOut(BaseModel):
    order_no: str
    status: Literal["pending", "paid", "cancelled"]
    total_cents: int
    created_at: UtcDatetime
    paid_at: UtcDatetime | None
    items: list[OrderItemOut]


class LibraryItem(BaseModel):
    slug: str
    name: str
    cover_url: str
    skill_count: int
    netdisk_url: str | None
    netdisk_code: str | None
    order_no: str
    paid_at: UtcDatetime


# ---------- 充电档位 ----------

class TierOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    price_cents: int
    description: str
    is_active: bool
    sort_order: int


class TierIn(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    price_cents: int = Field(ge=0, le=10_000_000)
    description: str = Field(default="", max_length=2000)
    is_active: bool = True
    sort_order: int = 0


class TierPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=64)
    price_cents: int | None = Field(default=None, ge=0, le=10_000_000)
    description: str | None = Field(default=None, max_length=2000)
    is_active: bool | None = None
    sort_order: int | None = None


class SupportInfo(BaseModel):
    """首页「支持我」板块：支付宝收款码 + 建议档位。"""

    alipay_qr_url: str | None
    alipay_note: str
    tiers: list[TierOut]


class SupportPatch(BaseModel):
    alipay_note: str = Field(max_length=200)


# ---------- API token ----------

class TokenCreate(BaseModel):
    name: str = Field(min_length=1, max_length=64)


class TokenOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    prefix: str
    created_at: UtcDatetime
    last_used_at: UtcDatetime | None
    revoked_at: UtcDatetime | None


class TokenCreated(TokenOut):
    token: str  # 明文，只在创建时返回这一次


# ---------- 管理：特效包 ----------

class AdminSkill(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    code: str
    name: str
    description: str
    phases: str


class AdminPack(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    slug: str
    name: str
    element: str
    price_cents: int
    summary: str
    cover_url: str
    sort_order: int
    is_new: bool
    is_published: bool
    netdisk_url: str | None
    netdisk_code: str | None
    skills: list[AdminSkill]


class PackPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=64)
    element: str | None = Field(default=None, min_length=1, max_length=16)
    price_cents: int | None = Field(default=None, ge=0, le=10_000_000)
    summary: str | None = Field(default=None, max_length=5000)
    sort_order: int | None = None
    is_new: bool | None = None
    is_published: bool | None = None
    netdisk_url: str | None = Field(default=None, max_length=512)
    netdisk_code: str | None = Field(default=None, max_length=32)


class SkillPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=64)
    description: str | None = Field(default=None, max_length=5000)
    phases: str | None = Field(default=None, max_length=2000)
