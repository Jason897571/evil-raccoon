import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { PackSummary } from './api'

export type CartItem = Pick<PackSummary, 'slug' | 'name' | 'price_cents' | 'cover_url'>

type Cart = {
  items: CartItem[]
  add: (item: CartItem) => void
  remove: (slug: string) => void
  has: (slug: string) => boolean
}

const KEY = 'er-cart'
const CartContext = createContext<Cart | null>(null)

function load(): CartItem[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as CartItem[]) : []
  } catch {
    return []
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(load)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(items))
    } catch {
      // 隐私模式等情况下存不了，购物车只在当前页面有效
    }
  }, [items])

  const add = useCallback((item: CartItem) => {
    setItems((prev) => (prev.some((i) => i.slug === item.slug) ? prev : [...prev, item]))
  }, [])
  const remove = useCallback(
    (slug: string) => setItems((prev) => (prev.some((i) => i.slug === slug) ? prev.filter((i) => i.slug !== slug) : prev)),
    [],
  )
  const has = useCallback((slug: string) => items.some((i) => i.slug === slug), [items])

  const value = useMemo(() => ({ items, add, remove, has }), [items, add, remove, has])
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart(): Cart {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart 必须在 CartProvider 里使用')
  return ctx
}
