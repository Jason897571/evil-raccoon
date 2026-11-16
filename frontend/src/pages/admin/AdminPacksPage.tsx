import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { deleteJson, formatShortPrice, patchJson, type AdminPack } from '../../api'
import { useApi } from '../../useApi'

type Filter = 'all' | 'published' | 'draft' | 'nolink'

const FILTERS: { key: Filter; label: string; test: (p: AdminPack) => boolean }[] = [
  { key: 'all', label: '全部', test: () => true },
  { key: 'published', label: '已上架', test: (p) => p.is_published },
  { key: 'draft', label: '未上架', test: (p) => !p.is_published },
  { key: 'nolink', label: '缺网盘链接', test: (p) => !p.netdisk_url },
]

/** 资源列表：搜索、按状态筛选，上下架、编辑、删除。 */
export function AdminPacksPage() {
  const { data, error, loading, reload } = useApi<AdminPack[]>('/api/admin/packs')
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const packs = data ?? []
  const shown = useMemo(() => {
    const kw = q.trim().toLowerCase()
    const test = FILTERS.find((f) => f.key === filter)!.test
    return packs.filter((p) => test(p) && (!kw || `${p.name} ${p.slug} ${p.element}`.toLowerCase().includes(kw)))
  }, [packs, q, filter])

  const run = async (slug: string, fn: () => Promise<unknown>, okText: string) => {
    setBusy(slug)
    setMsg(null)
    try {
      await fn()
      setMsg({ ok: true, text: okText })
      reload()
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message })
    } finally {
      setBusy(null)
    }
  }

  const togglePublish = (p: AdminPack) =>
    run(p.slug, () => patchJson(`/api/admin/packs/${p.slug}`, { is_published: !p.is_published }),
      `「${p.name}」已${p.is_published ? '下架' : '上架'}`)

  const remove = (p: AdminPack) => {
    if (!window.confirm(`确定删除「${p.name}」？包里的 ${p.skill_count} 个技能会一起删掉，不能恢复。`)) return
    void run(p.slug, () => deleteJson(`/api/admin/packs/${p.slug}`), `已删除「${p.name}」`)
  }

  const count = (f: Filter) => packs.filter(FILTERS.find((x) => x.key === f)!.test).length

  return (
    <section>
      <div className="stat-grid">
        <Stat label="资源总数" value={packs.length} sub={`${packs.reduce((n, p) => n + p.skill_count, 0)} 个技能`} />
        <Stat label="已上架" value={count('published')} sub="前台能看到、能买" />
        <Stat label="未上架" value={count('draft')} sub="前台看不到" />
        <Stat label="缺网盘链接" value={count('nolink')} sub="买了也拿不到文件" warn={count('nolink') > 0} />
      </div>

      <div className="admin-bar">
        <div className="admin-filters">
          <input className="admin-search" type="search" placeholder="搜索名称 / slug / 元素…" value={q}
            onChange={(e) => setQ(e.target.value)} aria-label="搜索资源" />
          <div className="chip-tabs" role="tablist" aria-label="状态筛选">
            {FILTERS.map((f) => (
              <button key={f.key} type="button" role="tab" aria-selected={filter === f.key} onClick={() => setFilter(f.key)}>
                {f.label} <span>{data ? count(f.key) : ''}</span>
              </button>
            ))}
          </div>
        </div>
        <Link className="btn btn-primary btn-sm" to="/admin/packs/new">＋ 添加资源</Link>
      </div>

      {msg && <p className={msg.ok ? 'ok-text' : 'form-error'} role="status" style={{ marginBottom: 16 }}>{msg.text}</p>}
      {loading && <p className="state">加载中…</p>}
      {error && <p className="form-error">{error.message}</p>}

      {data && (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>资源</th><th>元素</th><th>技能</th><th>售价</th><th>已售</th><th>网盘</th><th>状态</th><th><span className="sr-only">操作</span></th></tr>
            </thead>
            <tbody>
              {shown.length === 0 && <tr><td colSpan={8} className="muted">没有符合条件的资源</td></tr>}
              {shown.map((p) => (
                <tr key={p.slug}>
                  <td>
                    <Link to={`/admin/packs/${p.slug}`} className="pack-cell">
                      {p.cover_url ? <img src={p.cover_url} alt="" /> : <span className="thumb-empty" />}
                      <span>
                        <b>{p.name}</b>{p.is_new && <span className="pill pill-accent">NEW</span>}
                        <small>{p.slug}</small>
                      </span>
                    </Link>
                  </td>
                  <td>{p.element}</td>
                  <td>{p.skill_count}</td>
                  <td className="px price-cell">{formatShortPrice(p.price_cents)}</td>
                  <td>{p.sold_count}</td>
                  <td>{p.netdisk_url ? <span className="pill pill-ok">已填</span> : <span className="pill pill-bad">缺</span>}</td>
                  <td>
                    <span className={`pill ${p.is_published ? 'pill-ok' : ''}`}>{p.is_published ? '已上架' : '未上架'}</span>
                  </td>
                  <td>
                    <div className="row-actions">
                      <Link to={`/admin/packs/${p.slug}`}>编辑</Link>
                      <button type="button" className={`text-btn ${p.is_published ? '' : 'ok'}`} disabled={busy === p.slug}
                        onClick={() => void togglePublish(p)}>
                        {p.is_published ? '下架' : '上架'}
                      </button>
                      {p.is_published && <a href={`/packs/${p.slug}`} target="_blank" rel="noreferrer">查看</a>}
                      <button type="button" className="text-btn danger" disabled={busy === p.slug} onClick={() => remove(p)}>删除</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export function Stat({ label, value, sub, warn }: { label: string; value: string | number; sub?: string; warn?: boolean }) {
  return (
    <div className={`stat-tile${warn ? ' warn' : ''}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value px">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )
}
