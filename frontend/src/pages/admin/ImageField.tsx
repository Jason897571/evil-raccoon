import { useRef, useState } from 'react'
import { uploadImage } from '../../api'

/** 图片字段：预览 + 地址输入框 + 上传按钮（上传后自动填地址）。 */
export function ImageField({ id, label, value, onChange, wide }: {
  id: string; label: string; value: string; onChange: (v: string) => void; wide?: boolean
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const upload = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      onChange(await uploadImage(file))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className={`field image-field${wide ? ' wide' : ''}`}>
      <label htmlFor={id}>{label}</label>
      <div className="image-field-row">
        {value ? <img src={value} alt="" /> : <span className="thumb-empty" />}
        <input id={id} maxLength={255} value={value} onChange={(e) => onChange(e.target.value)} placeholder="/media/… 或上传" />
        <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? '上传中…' : '上传'}
        </button>
        <input ref={fileRef} type="file" accept="image/png,image/gif,image/jpeg,image/webp" hidden
          onChange={(e) => void upload(e.target.files?.[0])} />
      </div>
      {error && <span className="form-error">{error}</span>}
    </div>
  )
}
