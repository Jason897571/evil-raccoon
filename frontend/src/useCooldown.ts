import { useEffect, useState } from 'react'

/** 验证码重发倒计时（秒）。 */
export function useCooldown() {
  const [cooldown, setCooldown] = useState(0)
  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])
  return [cooldown, setCooldown] as const
}
