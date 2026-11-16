import { Link, useNavigate } from 'react-router-dom'
import { AFDIAN_URL, ITCH_URL } from '../api'
import { useAuth } from '../auth'
import { useCart } from '../cart'

export function SiteHeader({ compact = false }: { compact?: boolean }) {
  const { items } = useCart()
  const { ready, user, logout } = useAuth()
  const navigate = useNavigate()

  const signOut = async () => {
    await logout()
    navigate('/')
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
            <Link to="/orders">订单</Link>
            {user.is_admin && <Link to="/admin" className="admin-link">管理</Link>}
            <span className="account">
              <span className="email" title={user.email}>{user.email}</span>
              <button className="text-btn" onClick={() => void signOut()}>退出</button>
            </span>
          </>
        ) : (
          <Link to="/login">登录</Link>
        ))}
        <span className="socials">
          <a href={AFDIAN_URL} target="_blank" rel="noreferrer">爱发电</a>·
          <a href={ITCH_URL} target="_blank" rel="noreferrer">itch</a>
        </span>
      </nav>
    </header>
  )
}
