import { XHS_URL } from '../api'

/** 小红书标志：红底圆角块 + 白字，链接到我的小红书主页。 */
export function XhsLink({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  return (
    <a className={`xhs-link xhs-${size}`} href={XHS_URL} target="_blank" rel="noreferrer" aria-label="小红书主页">
      <span className="xhs-logo" aria-hidden="true">小红书</span>
    </a>
  )
}
