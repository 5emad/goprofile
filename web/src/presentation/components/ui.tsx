import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { dayKey, jalaliOf, keyFromJalali, weekday } from '@/domain/dates'
import { MONTHS, WEEKDAYS, jalaliMonthLength } from '@/domain/jalali'
import { Icon } from './Icon'

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="بستن">
            <Icon name="close" />
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  )
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-dots">
        {[1, 2, 3, 4].map((l) => (
          <i key={l} className={`lv-swatch lv${l}`} />
        ))}
      </div>
      <b>{title}</b>
      {children}
    </div>
  )
}

export function Spinner() {
  return <div className="spinner" aria-label="در حال بارگذاری" />
}

/** Jalali date picker storing a Gregorian "YYYY-MM-DD" value. */
export function JalaliDateInput({ value, onChange, allowEmpty, tz }: { value: string; onChange: (v: string) => void; allowEmpty?: boolean; tz: string }) {
  const [open, setOpen] = useState(false)
  const today = dayKey(new Date(), tz)
  const base = jalaliOf(value || today)
  const [view, setView] = useState({ jy: base.jy, jm: base.jm })
  const ref = useRef<HTMLDivElement>(null)
  const id = useId()

  useEffect(() => {
    if (!open) return
    const j = jalaliOf(value || today)
    setView({ jy: j.jy, jm: j.jm })
    const onDoc = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open, value, today])

  const shift = (n: number) => {
    let jm = view.jm + n
    let jy = view.jy
    if (jm < 1) {
      jm = 12
      jy--
    }
    if (jm > 12) {
      jm = 1
      jy++
    }
    setView({ jy, jm })
  }
  const first = keyFromJalali(view.jy, view.jm, 1)
  const lead = weekday(first)
  const len = jalaliMonthLength(view.jy, view.jm)
  const label = value ? `${jalaliOf(value).jd} ${MONTHS[jalaliOf(value).jm - 1]} ${jalaliOf(value).jy}` : 'انتخاب تاریخ'

  return (
    <div className="datepick" ref={ref}>
      <button type="button" className="input datepick-btn" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls={id}>
        {label}
      </button>
      {open && (
        <div className="datepick-pop" id={id}>
          <div className="datepick-head">
            <button type="button" className="icon-btn" onClick={() => shift(-1)} aria-label="ماه قبل">
              <Icon name="chevronR" size={16} />
            </button>
            <b>
              {MONTHS[view.jm - 1]} {view.jy}
            </b>
            <button type="button" className="icon-btn" onClick={() => shift(1)} aria-label="ماه بعد">
              <Icon name="chevronL" size={16} />
            </button>
          </div>
          <div className="datepick-grid">
            {WEEKDAYS.map((w) => (
              <span key={w} className="datepick-wd">
                {w.slice(0, 1)}
              </span>
            ))}
            {Array.from({ length: lead }, (_, i) => (
              <span key={`e${i}`} />
            ))}
            {Array.from({ length: len }, (_, i) => {
              const k = keyFromJalali(view.jy, view.jm, i + 1)
              return (
                <button
                  type="button"
                  key={k}
                  className={`datepick-day ${k === value ? 'on' : ''} ${k === today ? 'today' : ''}`}
                  onClick={() => {
                    onChange(k)
                    setOpen(false)
                  }}
                >
                  {i + 1}
                </button>
              )
            })}
          </div>
          <div className="datepick-foot">
            <button type="button" className="btn-link" onClick={() => (onChange(today), setOpen(false))}>
              امروز
            </button>
            {allowEmpty && (
              <button type="button" className="btn-link" onClick={() => (onChange(''), setOpen(false))}>
                پاک کردن
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export function Select<T extends string | number>({
  value,
  onChange,
  options,
  empty,
}: {
  value: T | null | ''
  onChange: (v: T | null) => void
  options: { value: T; label: string }[]
  empty?: string
}) {
  return (
    <select
      className="input"
      value={value === null ? '' : String(value)}
      onChange={(e) => {
        const raw = e.target.value
        if (raw === '') return onChange(null)
        const opt = options.find((o) => String(o.value) === raw)
        onChange(opt ? opt.value : null)
      }}
    >
      {empty !== undefined && <option value="">{empty}</option>}
      {options.map((o) => (
        <option key={String(o.value)} value={String(o.value)}>
          {o.label}
        </option>
      ))}
    </select>
  )
}
