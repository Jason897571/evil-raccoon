import { Link, useNavigate } from 'react-router-dom'
import { ITCH_URL } from '../api'
import { useAuth } from '../auth'
import { useCart } from '../cart'
import { AccountMenu } from './AccountMenu'
import { XhsLink } from './XhsLogo'

export function SiteHeader({ compact = false }: { compact?: boolean }) {
  const { items } = useCart()
  const { ready, user, logout } = useAuth()
  const navigate = useNavigate()

  // 先离开当前页再退出：不然在「我的订单」这类页面会先被踢到登录页
  const signOut = async () => {
    navigate('/')
    await logout()
  }

  return (
    <header className={compact ? 'site-header compact grid-bg' : 'site-header'}>
      <Link to="/" className="brand" aria-label="Evil Raccoon 首页">
        <span className="brand-name">EVIL RACCOON</span>
        <span className="brand-sub">PIXEL VFX STORE</span>
      </Link>
      <nav aria-label="主导航" className="site-nav">
        <Link to="/#packs">特效包</Link>
        <Link to="/#how">怎么用</Link>
        <Link to="/#support">每月发电</Link>
        <Link to="/cart">购物车 ({items.length})</Link>
        {ready && (user ? (
          <>
            <Link to="/library">我的素材</Link>
            <AccountMenu user={user} onLogout={() => void signOut()} />
          </>
        ) : (
          <Link to="/login">登录</Link>
        ))}
        <span className="socials">
          <XhsLink />
          <a href={ITCH_URL} target="_blank" rel="noreferrer">itch</a>
        </span>
      </nav>
    </header>
  )
}
