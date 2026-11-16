import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { getJson, postJson, type LibraryItem, type Me, type User } from './api'

type Auth = {
  ready: boolean
  user: User | null
  devTools: boolean
  owned: Set<string> // 已购买的特效包 slug
  refresh: () => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<Auth | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [devTools, setDevTools] = useState(false)
  const [owned, setOwned] = useState<Set<string>>(new Set())

  const refresh = useCallback(async () => {
    try {
      const me = await getJson<Me>('/api/auth/me')
      setUser(me.user)
      setDevTools(me.dev_tools)
      const lib = me.user ? await getJson<LibraryItem[]>('/api/library') : []
      setOwned(new Set(lib.map((i) => i.slug)))
    } catch {
      setUser(null)
      setOwned(new Set())
    } finally {
      setReady(true)
    }
  }, [])

  const logout = useCallback(async () => {
    await postJson('/api/auth/logout')
    setUser(null)
    setOwned(new Set())
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const value = useMemo(() => ({ ready, user, devTools, owned, refresh, logout }), [ready, user, devTools, owned, refresh, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): Auth {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth 必须在 AuthProvider 里使用')
  return ctx
}

/** 没登录就跳到登录页，登录完再回来。 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { ready, user } = useAuth()
  const location = useLocation()
  if (!ready) return <p className="state">加载中…</p>
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />
  return children
}

/** 只有管理员能进；普通客户看到无权限提示。 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  return (
    <RequireAuth>
      {user?.is_admin ? children : <p className="state">这个页面只有管理员能看。</p>}
    </RequireAuth>
  )
}
