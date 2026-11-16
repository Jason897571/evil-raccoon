import { NavLink, Outlet } from 'react-router-dom'
import { SiteHeader } from '../../components/SiteHeader'

export function AdminLayout() {
  return (
    <>
      <SiteHeader compact />
      <main className="container admin">
        <div className="admin-head">
          <h1 className="section-title">管理后台</h1>
          <nav className="admin-tabs" aria-label="管理">
            <NavLink to="/admin/tiers">充电档位</NavLink>
            <NavLink to="/admin/tokens">API Token</NavLink>
          </nav>
        </div>
        <Outlet />
      </main>
    </>
  )
}
