import { useCallback, useEffect, useState } from 'react'
import { getJson } from './api'

type Result<T> = { path: string; data: T | null; error: Error | null }

/** 拉取一个 GET 接口；path 变化或调用 reload() 时重新请求，组件卸载时取消。 */
export function useApi<T>(path: string): { data: T | null; error: Error | null; loading: boolean; reload: () => void } {
  const [result, setResult] = useState<Result<T> | null>(null)
  const [nonce, setNonce] = useState(0)
  const reload = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    const ctrl = new AbortController()
    getJson<T>(path, ctrl.signal)
      .then((data) => setResult({ path, data, error: null }))
      .catch((error: Error) => {
        if (!ctrl.signal.aborted) setResult({ path, data: null, error })
      })
    return () => ctrl.abort()
  }, [path, nonce])

  const current = result?.path === path ? result : null
  return { data: current?.data ?? null, error: current?.error ?? null, loading: current === null, reload }
}
