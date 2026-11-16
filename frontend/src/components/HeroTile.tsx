import type { HeroTile as Tile } from '../api'

export function HeroTile({ tile }: { tile: Tile }) {
  return (
    <figure className="tile">
      <div className="tile-box">
        <img className="pixelated" src={tile.gif_url} alt={`${tile.label}系技能：${tile.skill_name}`} />
      </div>
      <figcaption>{tile.label}</figcaption>
    </figure>
  )
}
