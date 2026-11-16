import { Link } from 'react-router-dom'
import { formatPrice, type PackSummary } from '../api'

export function PackCard({ pack }: { pack: PackSummary }) {
  const price = formatPrice(pack.price_cents)
  return (
    <Link to={`/packs/${pack.slug}`} className="pack-card" aria-label={`查看${pack.name}特效包详情，${price}`}>
      <div className="pack-cover">
        <img src={pack.cover_url} alt={`${pack.name}特效包封面`} loading="lazy" />
        {pack.is_new && <span className="badge-new">新上架</span>}
      </div>
      <div className="pack-line">
        <span className="px">{pack.name}</span>
        <span className="px price">{price}</span>
      </div>
      <div className="pack-meta">{pack.skill_count} 个技能 · 64×64 · 可商用</div>
    </Link>
  )
}
