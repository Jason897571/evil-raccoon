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

export type User = { email: string; is_admin: boolean }
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
export const deleteJson = <T = void>(path: string) => send<T>('DELETE', path)

export const formatPrice = (cents: number) => `¥${(cents / 100).toFixed(2)}`

/** 整数金额去掉 .00：¥5、¥19.90 */
export const formatShortPrice = (cents: number) => formatPrice(cents).replace(/\.00$/, '')

export const formatTime = (iso: string) =>
  new Date(iso).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })

export const STATUS_LABEL: Record<OrderStatus, string> = { pending: '待付款', paid: '已付款', cancelled: '已取消' }

export const AFDIAN_URL = 'https://afdian.com/a/evil_raccoon'
export const ITCH_URL = 'https://evil-raccoon.itch.io'
