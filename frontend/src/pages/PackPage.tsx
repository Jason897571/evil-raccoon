import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { NotFoundError, formatPrice, type PackDetail } from '../api'
import { useAuth } from '../auth'
import { useCart } from '../cart'
import { PackCard } from '../components/PackCard'
import { SiteHeader } from '../components/SiteHeader'
import { useApi } from '../useApi'
import { NotFoundPage } from './NotFoundPage'

type Tab = 'gif' | 'png'

export function PackPage() {
  const { slug = '' } = useParams()
  const { data: pack, error, loading } = useApi<PackDetail>(`/api/packs/${encodeURIComponent(slug)}`)
  const [tab, setTab] = useState<Tab>('gif')
  const cart = useCart()
  const { owned } = useAuth()
  const navigate = useNavigate()

  if (error instanceof NotFoundError) return <NotFoundPage />

  const inCart = pack ? cart.has(pack.slug) : false
  const isOwned = pack ? owned.has(pack.slug) : false
  const addToCart = () => {
    if (pack) cart.add({ slug: pack.slug, name: pack.name, price_cents: pack.price_cents, cover_url: pack.cover_url })
  }
  const buyNow = () => {
    addToCart()
    navigate('/cart')
  }

  return (
    <>
      <SiteHeader compact />
      <main className="container">
        <div className="crumbs">
          <Link to="/#packs">← 全部特效包</Link>
          <span>/</span>
          <span>{pack?.name ?? slug}</span>
        </div>

        {loading && <p className="state">加载中…</p>}
        {error && <p className="state">加载失败：{error.message}</p>}

        {pack && (
          <>
            <section className="product">
              <div className="product-cover">
                <div className="pack-cover" style={{ transform: 'none' }}>
                  <img src={pack.cover_url} alt={`${pack.name}特效包封面`} />
                </div>
              </div>

              <div className="product-info">
                <div className="eyebrow" style={{ fontSize: 14 }}>PIXEL SKILL VFX · {pack.slug.toUpperCase()}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                  <h1>{pack.name}</h1>
                  {pack.is_new && <span className="badge-new" style={{ position: 'static' }}>新上架</span>}
                </div>
                {pack.summary && <p className="lead">{pack.summary}</p>}

                <div className="facts">
                  <div className="fact"><span className="px">{pack.skill_count}</span><span>个技能</span></div>
                  <div className="fact"><span className="px">64×64</span><span>每帧尺寸</span></div>
                  <div className="fact"><span className="px">可商用</span><span>含 Steam、手游</span></div>
                </div>

                <div className="buy">
                  <span className="price">{formatPrice(pack.price_cents)}</span>
                  {isOwned ? (
                    <Link className="btn btn-primary" to="/library">已购买 · 去下载</Link>
                  ) : (
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      <button className="btn btn-primary" onClick={addToCart} disabled={inCart}>
                        {inCart ? '已在购物车' : '加入购物车'}
                      </button>
                      <button className="btn btn-ghost" onClick={buyNow}>立即购买</button>
                    </div>
                  )}
                </div>

                <div className="info-cols">
                  <div>
                    <h2>文件内容</h2>
                    <ul className="bullets">
                      <li>PNG 精灵图：每帧 64×64，一行一个动画阶段，透明背景</li>
                      <li>GIF 预览（4 倍放大）</li>
                      <li>.aseprite 源文件：带命名标签和逐帧时长，可自行修改</li>
                      <li>可直接导入 Unity / Godot / GameMaker 等引擎</li>
                    </ul>
                  </div>
                  <div>
                    <h2>授权</h2>
                    <ul className="bullets">
                      <li className="ok">可用于个人及商业项目（含上架 Steam、手游等）</li>
                      <li className="ok">可修改后用于你的项目</li>
                      <li className="bad">禁止原样或修改后转售、二次分发素材本身</li>
                      <li className="plain muted">署名非必须，欢迎标注 evil raccoon。</li>
                    </ul>
                  </div>
                </div>
              </div>
            </section>

            <section className="section" aria-label="技能预览" style={{ paddingTop: 64, paddingBottom: 96 }}>
              <div className="preview-head">
                <div>
                  <h2 className="section-title">包含技能</h2>
                  <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>预览图带水印，购买后下载的文件没有水印</div>
                </div>
                <div className="tabs" role="tablist" aria-label="预览类型">
                  <button role="tab" className="tab" aria-selected={tab === 'gif'} onClick={() => setTab('gif')}>GIF 动图</button>
                  <button role="tab" className="tab" aria-selected={tab === 'png'} onClick={() => setTab('png')}>PNG 精灵图</button>
                </div>
              </div>

              {tab === 'gif' ? (
                <div className="gif-grid">
                  {pack.skills.map((s, i) => (
                    <article key={s.code} className="skill">
                      <div className="skill-gif">
                        <img className="pixelated" src={s.preview_gif_url} alt={`${s.name} 动画预览`} loading="lazy" />
                      </div>
                      <SkillTitle no={i + 1} name={s.name} />
                      {s.phases && <div className="phases">{s.phases}</div>}
                      <p>{s.description}</p>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="sheet-grid">
                  {pack.skills.map((s, i) => (
                    <article key={s.code} className="skill">
                      <SkillTitle no={i + 1} name={s.name} />
                      {s.phases && <div className="phases">{s.phases}</div>}
                      <div className="sheet-box">
                        <img
                          className="pixelated"
                          src={s.sheet_url}
                          alt={`${s.name} 精灵图预览，${s.sheet_rows} 行，每行一个动画阶段`}
                          width={s.sheet_cols * 64}
                          height={s.sheet_rows * 64}
                          loading="lazy"
                        />
                      </div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {s.sheet_cols} 列 × {s.sheet_rows} 行 · 每帧 64×64 · 一行一个阶段
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="section" style={{ paddingTop: 72, paddingBottom: 96 }}>
              <div className="pack-line" style={{ marginBottom: 28 }}>
                <h2 className="px" style={{ margin: 0, fontSize: 36 }}>更多特效包</h2>
                <Link to="/#packs" style={{ fontSize: 13, fontWeight: 700, textDecoration: 'underline' }}>查看全部</Link>
              </div>
              <div className="pack-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 32 }}>
                {pack.related.map((p) => <PackCard key={p.slug} pack={p} />)}
              </div>
            </section>
          </>
        )}
      </main>
    </>
  )
}

function SkillTitle({ no, name }: { no: number; name: string }) {
  return (
    <div className="skill-title">
      <span className="no">{String(no).padStart(2, '0')}</span>
      <h3>{name}</h3>
    </div>
  )
}
