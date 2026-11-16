import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { formatTime, getJson, postJson, type ApiToken, type ApiTokenCreated } from '../../api'

export function AdminTokensPage() {
  const [tokens, setTokens] = useState<ApiToken[] | null>(null)
  const [name, setName] = useState('')
  const [created, setCreated] = useState<ApiTokenCreated | null>(null)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setTokens(await getJson<ApiToken[]>('/api/admin/tokens'))
    } catch (err) {
      setError((err as Error).message)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const create = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      setCreated(await postJson<ApiTokenCreated>('/api/admin/tokens', { name: name.trim() }))
      setCopied(false)
      setName('')
      await load()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const revoke = async (t: ApiToken) => {
    if (!window.confirm(`吊销「${t.name}」后，用它的脚本会立刻失效，确定吗？`)) return
    try {
      await postJson(`/api/admin/tokens/${t.id}/revoke`)
      await load()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const copy = async () => {
    if (!created) return
    try {
      await navigator.clipboard.writeText(created.token)
      setCopied(true)
    } catch {
      // 复制失败时用户可以手动选中
    }
  }

  const origin = window.location.origin
  const example = created?.token ?? 'er_你的token'

  return (
    <section>
      <form className="admin-bar" onSubmit={create}>
        <div className="field" style={{ flex: '1 1 280px' }}>
          <label htmlFor="token-name">新建 token（写清楚给谁用，比如「上新脚本」）</label>
          <input id="token-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={64} required placeholder="上新脚本" />
        </div>
        <button className="btn btn-primary" disabled={busy || !name.trim()} style={{ alignSelf: 'flex-end' }}>创建</button>
      </form>
      {error && <p className="form-error">{error}</p>}

      {created && (
        <div className="card token-created" role="status">
          <div className="px" style={{ fontSize: 24, color: 'var(--accent)' }}>「{created.name}」已创建</div>
          <p className="muted" style={{ fontSize: 13, margin: '6px 0 12px' }}>
            这串 token 只显示这一次，关掉页面就看不到了，请现在复制保存。泄露了就在下面吊销。
          </p>
          <div className="token-value">
            <code>{created.token}</code>
            <button className="link-btn" type="button" onClick={() => void copy()}>{copied ? '已复制' : '复制'}</button>
          </div>
        </div>
      )}

      <div className="table-wrap">
        <table className="admin-table">
          <thead>
            <tr><th>名称</th><th>开头</th><th>创建时间</th><th>最近使用</th><th>状态</th><th /></tr>
          </thead>
          <tbody>
            {tokens?.length === 0 && <tr><td colSpan={6} className="muted">还没有 token</td></tr>}
            {tokens?.map((t) => (
              <tr key={t.id} className={t.revoked_at ? 'revoked' : undefined}>
                <td>{t.name}</td>
                <td><code>{t.prefix}…</code></td>
                <td>{formatTime(t.created_at)}</td>
                <td>{t.last_used_at ? formatTime(t.last_used_at) : '—'}</td>
                <td>{t.revoked_at ? `已吊销 ${formatTime(t.revoked_at)}` : <span className="ok-text">有效</span>}</td>
                <td>{!t.revoked_at && <button className="link-btn" onClick={() => void revoke(t)}>吊销</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card api-doc">
        <h2 className="px" style={{ margin: '0 0 8px', fontSize: 24 }}>用 token 调 API</h2>
        <p className="muted" style={{ fontSize: 13, margin: '0 0 16px' }}>
          请求头带上 <code>Authorization: Bearer &lt;token&gt;</code>。token 能上下架、改特效包和技能文案、改充电档位；不能创建或吊销 token。
        </p>
        <pre>{`# 看所有特效包（含已下架、网盘链接）
curl -H "Authorization: Bearer ${example}" ${origin}/api/admin/packs

# 下架 / 上架
curl -X PATCH -H "Authorization: Bearer ${example}" -H "Content-Type: application/json" \\
  -d '{"is_published": false}' ${origin}/api/admin/packs/fire

# 改价格、简介、网盘链接（只传要改的字段）
curl -X PATCH -H "Authorization: Bearer ${example}" -H "Content-Type: application/json" \\
  -d '{"price_cents": 2490, "summary": "新简介", "netdisk_url": "https://pan.baidu.com/s/xxx", "netdisk_code": "abcd"}' \\
  ${origin}/api/admin/packs/fire

# 改某个技能的名字 / 说明 / 动画阶段
curl -X PATCH -H "Authorization: Bearer ${example}" -H "Content-Type: application/json" \\
  -d '{"name": "火球术"}' ${origin}/api/admin/packs/fire/skills/fire_01_fireball

# 充电档位：GET/POST /api/admin/tiers，PATCH/DELETE /api/admin/tiers/{id}`}</pre>
        <p className="muted" style={{ fontSize: 13, margin: '12px 0 0' }}>
          特效包可改的字段：name、element、price_cents（分）、summary、sort_order、is_new、is_published、netdisk_url、netdisk_code。
          完整接口文档：后端地址加 <code>/docs</code>（本地是 http://localhost:8100/docs）。
        </p>
      </div>
    </section>
  )
}
