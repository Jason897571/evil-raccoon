import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { SHOW_SUPPORT, formatShortPrice, type Home, type PackSummary, type SupportInfo } from '../api'
import { HeroTile } from '../components/HeroTile'
import { PackCard } from '../components/PackCard'
import { SiteHeader } from '../components/SiteHeader'
import { SupportSection } from '../components/SupportSection'
import { useApi } from '../useApi'

const ALL = '全部'

export function HomePage() {
  const home = useApi<Home>('/api/home')
  const packs = useApi<PackSummary[]>('/api/packs')
  const support = useApi<SupportInfo>(SHOW_SUPPORT ? '/api/support' : null)
  const tiers = support.data?.tiers
  const [element, setElement] = useState(ALL)
  const { hash } = useLocation()

  // 从其他页面点「特效包 / 怎么用 / 每月发电」回来时，数据到了再滚到对应板块
  useEffect(() => {
    if (!hash || packs.loading) return
    document.getElementById(hash.slice(1))?.scrollIntoView()
  }, [hash, packs.loading])

  const visible = useMemo(
    () => (packs.data ?? []).filter((p) => element === ALL || p.element === element),
    [packs.data, element],
  )
  const hero = home.data?.hero ?? []
  const stats = home.data?.stats

  return (
    <>
      <section aria-label="首屏" className="hero grid-bg">
        <SiteHeader />
        <div className="hero-body">
          <div className="hero-side">{hero.slice(0, 4).map((t) => <HeroTile key={t.gif_url} tile={t} />)}</div>
          <div className="hero-center">
            <div className="eyebrow">EVIL RACCOON · PIXEL VFX</div>
            <div className="hero-heading">
              <img className="hero-avatar" src="/avatar-256.png" alt="Evil Raccoon 的头像" width={88} height={88} />
              <h1 className="hero-title">
                <span className="num">64x64</span>
                <span className="cn">像素技能特效</span>
              </h1>
            </div>
            <p className="hero-stats">
              {stats ? `${stats.elements} 种元素 · ${stats.skills} 个技能 · 可按风格定制` : ' '}
            </p>
            <div className="hero-row">{hero.slice(4, 8).map((t) => <HeroTile key={t.gif_url} tile={t} />)}</div>
            <p className="hero-formats">PNG 精灵图 · GIF · .aseprite 源文件 · Unity / Godot / GameMaker</p>
            <div className="hero-ctas">
              <a className="btn btn-primary" href="#packs">查看全部特效包</a>
              {SHOW_SUPPORT && (
                <a className="btn btn-ghost" href="#support">
                  {tiers?.length ? `${formatShortPrice(Math.min(...tiers.map((t) => t.price_cents)))}/月 发电` : '每月发电'}
                </a>
              )}
            </div>
          </div>
          <div className="hero-side">{hero.slice(8, 12).map((t) => <HeroTile key={t.gif_url} tile={t} />)}</div>
        </div>
      </section>

      <main>
        <section id="packs" className="section">
          <div className="container">
            <div className="section-head">
              <h2 className="section-title">特效包</h2>
              <div className="section-sub">VFX PACKS · {stats?.packs ?? '—'} · 全部可商用</div>
            </div>
            <div className="filters" role="group" aria-label="按元素筛选">
              {[ALL, ...(home.data?.elements ?? [])].map((e) => (
                <button key={e} className="filter" aria-pressed={element === e} onClick={() => setElement(e)}>
                  {e}
                </button>
              ))}
            </div>
            {packs.error && <p className="state">特效包加载失败：{packs.error.message}</p>}
            {packs.loading && <p className="state">加载中…</p>}
            <div className="pack-grid">
              {visible.map((p) => <PackCard key={p.slug} pack={p} />)}
            </div>
          </div>
        </section>

        <section id="how" className="section">
          <div className="container" style={{ maxWidth: 1080 }}>
            <div className="section-head" style={{ marginBottom: 60 }}>
              <h2 className="section-title">每个技能，三段动画</h2>
              <div className="section-sub">SPAWN · LOOP · HIT / END</div>
            </div>
            <div className="phase-cards">
              <div className="card"><div className="tag">01 SPAWN</div><h3>出现</h3><p>蓄力、预警、登场。</p></div>
              <div className="card"><div className="tag">02 LOOP</div><h3>循环</h3><p>无缝循环，飞行、燃烧、持续伤害想放多久放多久。</p></div>
              <div className="card"><div className="tag">03 HIT / END</div><h3>命中 / 结束</h3><p>命中爆开，或者慢慢消散。</p></div>
            </div>
            <p className="muted" style={{ margin: '48px 0 0', textAlign: 'center', fontSize: 13 }}>
              每个技能都附 <b style={{ color: '#fff' }}>.png</b> 精灵图、<b style={{ color: '#fff' }}>.gif</b> 预览和可编辑的{' '}
              <b style={{ color: '#fff' }}>.aseprite</b> 源文件，能直接导入 Unity / Godot / GameMaker
            </p>
          </div>
        </section>

        {SHOW_SUPPORT && (
          <section id="support" className="section">
            <div className="container">
              <SupportSection info={support.data} />
            </div>
          </section>
        )}
      </main>
    </>
  )
}
