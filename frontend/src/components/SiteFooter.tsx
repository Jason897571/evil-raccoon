import { ITCH_URL } from '../api'
import { XhsLink } from './XhsLogo'

const YEAR = new Date().getFullYear()

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="inner">
        <div className="brand">
          <span className="brand-name" style={{ fontSize: 16 }}>EVIL RACCOON</span>
          <span className="muted" style={{ fontSize: 12 }}>© {YEAR} Evil Raccoon</span>
        </div>
        <div className="links">
          <XhsLink size="md" />
          <a href={ITCH_URL} target="_blank" rel="noreferrer">itch.io</a>
        </div>
      </div>
    </footer>
  )
}
