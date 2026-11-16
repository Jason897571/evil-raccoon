import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { User } from '../api'

type Item = { label: string; to?: string; onSelect?: () => void; tone?: 'accent' | 'danger' }

/** 顶栏右侧的账号下拉菜单：头像 + 昵称，点开是个人设置、订单、管理后台、退出。 */
export function AccountMenu({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const navigate = useNavigate()
  const { pathname } = useLocation()

  const name = user.display_name || user.email.split('@')[0]
  const items: Item[] = [
    { label: '个人设置', to: '/settings' },
    { label: '我的订单', to: '/orders' },
    ...(user.is_admin ? [{ label: '管理后台', to: '/admin', tone: 'accent' as const }] : []),
    { label: '退出登录', onSelect: onLogout, tone: 'danger' },
  ]

  // 换页面时收起
  useEffect(() => setOpen(false), [pathname])

  // 点菜单外面或按 Esc 收起
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const focusItem = (index: number) => {
    const els = menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')
    if (!els?.length) return
    els[(index + els.length) % els.length].focus()
  }

  const openAndFocus = (index: number) => {
    setOpen(true)
    requestAnimationFrame(() => focusItem(index))
  }

  const onTriggerKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); openAndFocus(0) }
    if (e.key === 'ArrowUp') { e.preventDefault(); openAndFocus(-1) }
  }

  const onMenuKey = (e: KeyboardEvent) => {
    const els = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])
    const current = els.indexOf(document.activeElement as HTMLButtonElement)
    if (e.key === 'ArrowDown') { e.preventDefault(); focusItem(current + 1) }
    if (e.key === 'ArrowUp') { e.preventDefault(); focusItem(current - 1) }
    if (e.key === 'Home') { e.preventDefault(); focusItem(0) }
    if (e.key === 'End') { e.preventDefault(); focusItem(-1) }
    if (e.key === 'Tab') setOpen(false)
  }

  const select = (item: Item) => {
    setOpen(false)
    if (item.to) navigate(item.to)
    item.onSelect?.()
  }

  return (
    <div className="account-menu" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="account-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onTriggerKey}
      >
        <span className="account-avatar" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>
        <span className="account-name">{name}</span>
        <span className="account-caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="account-dropdown" id={menuId} role="menu" ref={menuRef} onKeyDown={onMenuKey}>
          <div className="account-label" title={user.email}>{user.email}</div>
          <div className="account-sep" role="separator" />
          {items.map((item, i) => (
            <div key={item.label}>
              {item.tone === 'danger' && i > 0 && <div className="account-sep" role="separator" />}
              <button
                type="button"
                role="menuitem"
                className={`account-item${item.tone ? ` ${item.tone}` : ''}`}
                onClick={() => select(item)}
              >
                {item.label}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
