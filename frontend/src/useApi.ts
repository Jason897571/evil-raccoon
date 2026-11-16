import { useEffect, useState } from 'react'
import { getJson } from './api'

type Result<T> = { path: string; data: T | null; error: Error | null }

/** 拉取一个 GET 接口；path 变化时重新请求，组件卸载时取消。 */
export function useApi<T>(path: string): { data: T | null; error: Error | null; loading: boolean } {
  const [result, setResult] = useState<Result<T> | null>(null)

  useEffect(() => {
    const ctrl = new AbortController()
    getJson<T>(path, ctrl.signal)
      .then((data) => setResult({ path, data, error: null }))
      .catch((error: Error) => {
        if (!ctrl.signal.aborted) setResult({ path, data: null, error })
      })
    return () => ctrl.abort()
  }, [path])

  const current = result?.path === path ? result : null
  return { data: current?.data ?? null, error: current?.error ?? null, loading: current === null }
}
