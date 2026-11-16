import { Link } from 'react-router-dom'
import { SiteHeader } from '../components/SiteHeader'

export function NotFoundPage() {
  return (
    <>
      <SiteHeader compact />
      <main className="container state">
        <h1 className="section-title">找不到这个页面</h1>
        <p>可能链接写错了，或者这个特效包已经下架。</p>
        <Link className="btn btn-primary" to="/">回到首页</Link>
      </main>
    </>
  )
}
