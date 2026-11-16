export type PackSummary = {
  slug: string
  name: string
  element: string
  price_cents: number
  skill_count: number
  cover_url: string
  is_new: boolean
}

export type Skill = {
  code: string
  name: string
  description: string
  phases: string
  preview_gif_url: string
  sheet_url: string
  sheet_cols: number
  sheet_rows: number
}

export type PackDetail = PackSummary & {
  summary: string
  skills: Skill[]
  related: PackSummary[]
}

export type HeroTile = { label: string; skill_name: string; gif_url: string }

export type Home = {
  hero: HeroTile[]
  stats: { packs: number; skills: number; elements: number }
  elements: string[]
}

export type User = { email: string; display_name: string | null; is_admin: boolean; has_password: boolean; created_at: string }
export type Me = { user: User | null; dev_tools: boolean }
export type CodeSent = { sent: boolean; resend_after: number; dev_code: string | null }

export type OrderStatus = 'pending' | 'paid' | 'cancelled'
export type OrderItem = { slug: string; name: string; price_cents: number; cover_url: string }
export type Order = {
  order_no: string
  status: OrderStatus
  total_cents: number
  created_at: string
  paid_at: string | null
  items: OrderItem[]
}

export type LibraryItem = {
  slug: string
  name: string
  cover_url: string
  skill_count: number
  netdisk_url: string | null
  netdisk_code: string | null
  order_no: string
  paid_at: string
}

export type Tier = {
  id: number
  name: string
  price_cents: number
  description: string
  is_active: boolean
  sort_order: number
}

export type SupportInfo = { pay_enabled: boolean; tiers: Tier[] }
export type PayStart = { out_trade_no: string; pay_url: string }
export type SupportPayment = {
  out_trade_no: string
  status: 'pending' | 'paid'
  amount_cents: number
  tier_name: string | null
  supporter_name: string | null
  message: string | null
  created_at: string
  paid_at: string | null
}

export type ApiToken = {
  id: number
  name: string
  prefix: string
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
}
export type ApiTokenCreated = ApiToken & { token: string }

export class NotFoundError extends Error {}

/** 后端错误统一带 detail 字段，取出来直接给用户看。 */
export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function handle<T>(res: Response, path: string): Promise<T> {
  if (res.status === 404) throw new NotFoundError(path)
  if (res.status === 204) return undefined as T
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const detail = body?.detail
    const message = typeof detail === 'string' ? detail : Array.isArray(detail) ? '填写的内容格式不对' : `请求失败（${res.status}）`
    throw new ApiError(res.status, message)
  }
  return body as T
}

export async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  return handle<T>(await fetch(path, { signal }), path)
}

async function send<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return handle<T>(res, path)
}

export const postJson = <T>(path: string, body?: unknown) => send<T>('POST', path, body)
export const patchJson = <T>(path: string, body: unknown) => send<T>('PATCH', path, body)
export const putJson = <T>(path: string, body: unknown) => send<T>('PUT', path, body)
export const deleteJson = <T = void>(path: string) => send<T>('DELETE', path)

/** 管理后台上传图片，返回 /media/... 地址。 */
export async function uploadImage(file: File): Promise<string> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch('/api/admin/uploads', { method: 'POST', body: form })
  return (await handle<{ url: string }>(res, '/api/admin/uploads')).url
}

export const formatPrice = (cents: number) => `¥${(cents / 100).toFixed(2)}`

/** 整数金额去掉 .00：¥5、¥19.90 */
export const formatShortPrice = (cents: number) => formatPrice(cents).replace(/\.00$/, '')

export const formatTime = (iso: string) =>
  new Date(iso).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })

export const STATUS_LABEL: Record<OrderStatus, string> = { pending: '待付款', paid: '已付款', cancelled: '已取消' }

/** 每月发电先对用户隐藏（顶栏入口、首页按钮和板块）；后台的充电档位、发电记录不受影响。改回 true 即恢复。 */
export const SHOW_SUPPORT = false

export const XHS_URL = 'https://www.xiaohongshu.com/user/profile/5c22a55b00000000070253bb'
export const ITCH_URL = 'https://evil-raccoon.itch.io'

// ---------- 管理后台 ----------

export type AdminHeroSlot = {
  position: number
  label: string
  gif_url: string
  skill_code: string | null
  skill_name: string | null
  pack_slug: string | null
  pack_name: string | null
  pack_published: boolean | null
}

export type AdminSkill = {
  code: string
  sort_order: number
  name: string
  description: string
  phases: string
  preview_gif_url: string
  sheet_url: string
  sheet_cols: number
  sheet_rows: number
}

export type AdminPack = {
  slug: string
  name: string
  element: string
  price_cents: number
  summary: string
  cover_url: string
  sort_order: number
  is_new: boolean
  is_published: boolean
  netdisk_url: string | null
  netdisk_code: string | null
  created_at: string
  skill_count: number
  sold_count: number
  skills: AdminSkill[]
}

export type AdminUserRow = {
  id: number
  email: string
  display_name: string | null
  is_admin: boolean
  has_password: boolean
  created_at: string
  last_login_at: string | null
  paid_order_count: number
  paid_cents: number
  support_cents: number
}

export type AdminUserDetail = {
  user: AdminUserRow
  password_locked_until: string | null
  password_failures: number
  session_count: number
  last_session_at: string | null
  pending_order_count: number
  support_count: number
  orders: Order[]
  owned: { slug: string; name: string; cover_url: string; order_no: string; paid_at: string | null }[]
  support_payments: SupportPayment[]
}
