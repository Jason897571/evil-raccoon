import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AFDIAN_URL, formatTime, type LibraryItem } from '../api'
import { SiteHeader } from '../components/SiteHeader'
import { useApi } from '../useApi'

export function LibraryPage() {
  const { data: items, error, loading } = useApi<LibraryItem[]>('/api/library')

  return (
    <>
      <SiteHeader compact />
      <main className="container narrow">
        <h1 className="section-title">我的素材</h1>
        <p className="muted" style={{ margin: '8px 0 32px', fontSize: 13 }}>
          买过的特效包都在这里，网盘链接长期有效。下载后解压即可，压缩包里有 PNG、GIF 和 .aseprite 源文件。
        </p>
        {loading && <p className="state">加载中…</p>}
        {error && <p className="state">加载失败：{error.message}</p>}
        {items?.length === 0 && (
          <div className="state" style={{ padding: '64px 0' }}>
            <p>还没有买过特效包</p>
            <Link className="btn btn-primary" to="/#packs">去挑特效包</Link>
          </div>
        )}
        <ul className="cart-list">
          {items?.map((i) => <LibraryRow key={i.slug} item={i} />)}
        </ul>
      </main>
    </>
  )
}

function LibraryRow({ item }: { item: LibraryItem }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    if (!item.netdisk_code) return
    try {
      await navigator.clipboard.writeText(item.netdisk_code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // 浏览器不让写剪贴板时，用户还能手动选中提取码
    }
  }

  return (
    <li className="cart-item library-item">
      <img src={item.cover_url} alt="" />
      <div className="grow">
        <Link to={`/packs/${item.slug}`} className="px" style={{ fontSize: 24 }}>{item.name}</Link>
        <div className="muted" style={{ fontSize: 12 }}>
          {item.skill_count} 个技能 · 订单 {item.order_no} · {formatTime(item.paid_at)}
        </div>
      </div>
      {item.netdisk_url ? (
        <div className="download">
          {item.netdisk_code && (
            <span className="code">
              提取码 <b>{item.netdisk_code}</b>
              <button className="text-btn" onClick={() => void copy()}>{copied ? '已复制' : '复制'}</button>
            </span>
          )}
          <a className="btn btn-primary" href={item.netdisk_url} target="_blank" rel="noreferrer">打开网盘</a>
        </div>
      ) : (
        <span className="muted" style={{ fontSize: 13, maxWidth: 220 }}>
          下载链接准备中，可以在 <a href={AFDIAN_URL} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>爱发电</a> 私信我
        </span>
      )}
    </li>
  )
}
