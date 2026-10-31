import { useEffect, useRef, useState } from 'react'
import type { ActivityGrid, Cell, Summary } from '@/domain/activity'
import { fmtDay } from '@/domain/dates'
import { MONTHS } from '@/domain/jalali'
import { Icon } from './Icon'

type Mode = 'flat' | 'iso'

interface Hover {
  cell: Cell
  x: number
  y: number
}

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
// Overshoots slightly before settling, like a spring.
const easeOutBack = (t: number) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2

const css = (name: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback

function rgb(hex: string): [number, number, number] {
  const m = hex.replace('#', '')
  const n = parseInt(m.length === 3 ? m.replace(/./g, (c) => c + c) : m, 16)
  return [n >> 16, (n >> 8) & 255, n & 255]
}

/** Darkens (amount > 0) or lightens (amount < 0) a hex colour. */
function shade(hex: string, amount: number) {
  const f = (c: number) => Math.round(clamp(amount >= 0 ? c * (1 - amount) : c + (255 - c) * -amount, 0, 255))
  const [r, g, b] = rgb(hex)
  return `rgb(${f(r)}, ${f(g)}, ${f(b)})`
}

const WEEKDAY_LABELS: [number, string][] = [
  [1, 'یکشنبه'],
  [3, 'سه‌شنبه'],
  [5, 'پنجشنبه'],
]

/**
 * One canvas for both views. `t` morphs the camera from the flat grid (0) to
 * the isometric board (1); bars rise in a wave as the board tilts, the way a
 * 3D scene would, and hovering lifts a single cube.
 */
function ActivityCanvas({ grid, mode, onHover }: { grid: ActivityGrid; mode: Mode; onHover: (h: Hover | null) => void }) {
  const scroller = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [width, setWidth] = useState(0)
  const t = useRef(0)
  const hovered = useRef<string | null>(null)
  const drawRef = useRef<() => void>(() => {})
  const faces = useRef<{ cell: Cell; poly: [number, number][]; tip: [number, number] }[]>([])

  const W = grid.weeks.length

  // Geometry in CSS pixels for the current width.
  const minW = 760
  const cw = Math.max(width, minW)
  const pitch = Math.min(19, (cw - 64) / W)
  const cell = pitch * 0.8
  const flatLeft = cw - W * pitch - 4
  const flatTop = 26
  const flatH = flatTop + 7 * pitch + 4
  const ux = cw / (W + 7 + 1.2)
  const uy = ux * 0.578
  const maxH = ux * 9
  const isoTop = 7 * uy + maxH + 12
  const isoH = isoTop + W * uy + 36
  const height = Math.max(flatH, isoH)

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const cv = canvas.current
    if (!cv || !width) return
    const dpr = window.devicePixelRatio || 1
    cv.width = Math.round(cw * dpr)
    cv.height = Math.round(height * dpr)
    cv.style.width = `${cw}px`
    cv.style.height = `${height}px`
    // Show the newest weeks first when the board is wider than the screen.
    if (scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth
    const ctx = cv.getContext('2d')!

    const cells: { c: Cell; w: number; d: number }[] = []
    grid.weeks.forEach((col, w) => col.forEach((c, d) => !c.future && cells.push({ c, w, d })))
    // Painter's order for the isometric view; the flat view has no overlaps.
    cells.sort((a, b) => a.w - a.d - (b.w - b.d) || a.w - b.w)

    const draw = () => {
      const levels = [0, 1, 2, 3, 4].map((l) => css(`--l${l}`, '#ebece8'))
      const muted = css('--muted', '#7d8471')
      const text = css('--text', '#2b3320')
      const surface = css('--surface', '#ffffff')
      const k = easeInOut(t.current)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, cw, height)
      ctx.lineJoin = 'round'

      // Camera: interpolate every corner between the flat and isometric projections.
      const P = (w: number, d: number, h: number): [number, number] => [
        lerp(flatLeft + w * pitch, 8 + (w + d) * ux, k),
        lerp(flatTop + d * pitch, isoTop + (w - d) * uy - h, k),
      ]
      const inset = lerp((pitch - cell) / pitch / 2, 0.06, k)

      const hit: typeof faces.current = []
      for (const { c, w, d } of cells) {
        const isHover = hovered.current === c.key
        const wave = clamp((t.current - 0.25 - (w / W) * 0.4) / 0.35)
        const grow = wave <= 0 ? 0 : easeOutBack(wave)
        const full = c.count ? 0.6 + (c.count / Math.max(1, grid.max)) * 8.4 : 0.18
        let h = full * ux * grow * k
        if (isHover && k > 0.5) h = Math.max(h, ux * 0.9) + ux * 0.45
        const a = w + inset
        const b = d + inset
        const e = w + 1 - inset
        const f = d + 1 - inset
        const base = levels[c.level]
        const top = isHover && !c.count && k > 0.5 ? shade(levels[0], 0.18) : isHover ? shade(base, -0.15) : base

        const quad = (pts: [number, number][], fill: string) => {
          ctx.beginPath()
          pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
          ctx.closePath()
          ctx.fillStyle = fill
          ctx.fill()
        }
        if (h > 0.2) {
          quad([P(a, b, 0), P(e, b, 0), P(e, b, h), P(a, b, h)], shade(base, 0.12))
          quad([P(e, b, 0), P(e, f, 0), P(e, f, h), P(e, b, h)], shade(base, 0.25))
        }
        const topFace = [P(a, b, h), P(e, b, h), P(e, f, h), P(a, f, h)] as [number, number][]
        // Flat cells get rounded corners; they straighten out as the board tilts.
        if (k < 0.05) {
          const [x, y] = topFace[0]
          ctx.beginPath()
          ctx.roundRect(x, y, cell, cell, 2.5)
          ctx.fillStyle = top
          ctx.fill()
        } else {
          quad(topFace, top)
          ctx.strokeStyle = surface
          ctx.globalAlpha = 0.6 * k
          ctx.lineWidth = 0.7
          ctx.stroke()
          ctx.globalAlpha = 1
        }
        if (isHover) {
          ctx.strokeStyle = text
          ctx.globalAlpha = 0.55
          ctx.lineWidth = 1
          ctx.beginPath()
          topFace.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
          ctx.closePath()
          ctx.stroke()
          ctx.globalAlpha = 1
        }
        const cx = (topFace[0][0] + topFace[2][0]) / 2
        const cyTop = Math.min(...topFace.map((p) => p[1]))
        hit.push({ cell: c, poly: topFace, tip: [cx, cyTop] })
      }

      // Labels fade between the two views.
      ctx.font = '10px IRANYekanX, Tahoma, sans-serif'
      ctx.fillStyle = muted
      ctx.globalAlpha = 1 - k
      ctx.textAlign = 'left'
      for (const m of grid.monthLabels) ctx.fillText(MONTHS[m.month - 1], flatLeft + m.week * pitch, flatTop - 9)
      ctx.textAlign = 'right'
      for (const [d, label] of WEEKDAY_LABELS) ctx.fillText(label, flatLeft - 8, flatTop + d * pitch + cell * 0.8)
      ctx.globalAlpha = k
      for (const m of grid.monthLabels) {
        const [x, y] = [8 + (m.week - 0.9) * ux, isoTop + (m.week + 0.9) * uy]
        ctx.fillText(MONTHS[m.month - 1], x, y + 12)
      }
      ctx.globalAlpha = 1
      faces.current = hit
    }
    drawRef.current = draw

    // Animate the camera toward the requested view.
    let raf = 0
    const target = mode === 'iso' ? 1 : 0
    const from = t.current
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const duration = reduce ? 1 : target === 1 ? 1500 : 800
    const start = performance.now()
    const tick = (now: number) => {
      const p = clamp((now - start) / duration)
      t.current = lerp(from, target, p)
      draw()
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    const inside = (x: number, y: number, poly: [number, number][]) => {
      let ok = false
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i]
        const [xj, yj] = poly[j]
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ok = !ok
      }
      return ok
    }
    const move = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect()
      const x = e.clientX - r.left
      const y = e.clientY - r.top
      // Topmost face wins: walk in reverse paint order.
      const face = [...faces.current].reverse().find((f) => inside(x, y, f.poly))
      const key = face?.cell.key ?? null
      cv.style.cursor = face ? 'pointer' : 'default'
      if (key !== hovered.current) {
        hovered.current = key
        draw()
      }
      const now = faces.current.find((f) => f.cell.key === key)
      const box = scroller.current!.parentElement!.getBoundingClientRect()
      onHover(now ? { cell: now.cell, x: now.tip[0] + r.left - box.left, y: now.tip[1] + r.top - box.top - 8 } : null)
    }
    const leave = () => {
      hovered.current = null
      onHover(null)
      draw()
    }
    cv.addEventListener('pointermove', move)
    cv.addEventListener('pointerleave', leave)

    const redraw = () => draw()
    const mo = new MutationObserver(redraw)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', redraw)
    return () => {
      cancelAnimationFrame(raf)
      cv.removeEventListener('pointermove', move)
      cv.removeEventListener('pointerleave', leave)
      mo.disconnect()
      mq.removeEventListener('change', redraw)
    }
  }, [grid, mode, width, cw, height, pitch, cell, flatLeft, ux, uy, isoTop, W, onHover])

  return (
    <div className="act-canvas" ref={scroller} style={{ height: mode === 'iso' ? isoH : flatH }}>
      <canvas ref={canvas} role="img" aria-label={mode === 'iso' ? 'نمای سه‌بعدی فعالیت' : 'جدول فعالیت'} />
    </div>
  )
}

/** Animated count-up for the headline numbers. */
function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(0)
  useEffect(() => {
    let raf = 0
    const start = performance.now()
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / 1100)
      setShown(Math.round(value * (1 - (1 - p) ** 3)))
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value])
  return <>{shown}</>
}

export function Legend() {
  return (
    <div className="legend">
      <span>کمتر</span>
      {[0, 1, 2, 3, 4].map((l) => (
        <i key={l} className={`lv-swatch lv${l}`} />
      ))}
      <span>بیشتر</span>
    </div>
  )
}

function Stat({ label, value, unit, sub, big }: { label: string; value: number; unit: string; sub?: string; big?: boolean }) {
  return (
    <div className={`act-stat ${big ? 'big' : ''}`}>
      <span className="act-stat-label">{label}</span>
      <div className="act-stat-row">
        <b>
          <CountUp value={value} />
        </b>
        <span className="act-stat-unit">
          {unit}
          <small>{sub ?? '—'}</small>
        </span>
      </div>
    </div>
  )
}

export function ActivityCard({ grid, summary, from, today, name }: { grid: ActivityGrid; summary: Summary; from: string; today: string; name: string }) {
  const [mode, setMode] = useState<Mode>(() => {
    try {
      return localStorage.getItem('gp.heat') === 'flat' ? 'flat' : 'iso'
    } catch {
      return 'iso'
    }
  })
  const [hover, setHover] = useState<Hover | null>(null)
  const pick = (m: Mode) => {
    setMode(m)
    setHover(null)
    try {
      localStorage.setItem('gp.heat', m)
    } catch {
      /* ignore */
    }
  }

  const total = <Stat big label="مجموع مشارکت‌ها" value={summary.total} unit="مشارکت" sub={`${fmtDay(from, true)} — ${fmtDay(today, true)}`} />
  const busiest = <Stat label="پرفعالیت‌ترین روز" value={summary.busiest?.count ?? 0} unit="مشارکت" sub={summary.busiest ? fmtDay(summary.busiest.key) : undefined} />
  const longest = (
    <Stat
      label="طولانی‌ترین تداوم"
      value={summary.longest?.length ?? 0}
      unit="روز"
      sub={summary.longest ? `${fmtDay(summary.longest.from)} — ${fmtDay(summary.longest.to)}` : undefined}
    />
  )
  const current = (
    <Stat
      label="تداوم فعلی"
      value={summary.current?.length ?? 0}
      unit="روز"
      sub={summary.current ? `${fmtDay(summary.current.from)} — ${fmtDay(summary.current.to)}` : undefined}
    />
  )

  return (
    <section className="card activity">
      <header className="activity-head">
        <h2>
          فعالیت‌های <b>{name}</b> در goprofile
        </h2>
        <div className="seg" role="tablist" aria-label="نوع نمایش">
          <button role="tab" aria-selected={mode === 'flat'} className={mode === 'flat' ? 'on' : ''} onClick={() => pick('flat')} title="نمای جدولی">
            <Icon name="grid" size={16} />
          </button>
          <button role="tab" aria-selected={mode === 'iso'} className={mode === 'iso' ? 'on' : ''} onClick={() => pick('iso')} title="نمای سه‌بعدی">
            <Icon name="cube" size={16} />
          </button>
        </div>
      </header>

      <div className={`activity-panel mode-${mode}`}>
        <ActivityCanvas grid={grid} mode={mode} onHover={setHover} />
        {hover && (
          <div className="heat-tip" style={{ left: hover.x, top: hover.y }}>
            <b>{hover.cell.count ? `${hover.cell.count} مشارکت` : 'بدون مشارکت'}</b> در {fmtDay(hover.cell.key, true)}
          </div>
        )}

        {/* 3D: stats float around the board. */}
        <div className="act-float act-top" aria-hidden={mode !== 'iso'}>
          {total}
          {busiest}
        </div>
        <div className="act-float act-bottom" aria-hidden={mode !== 'iso'}>
          {longest}
          {current}
          <Legend />
        </div>

        {/* Flat: stats sit in a row under the grid. */}
        <div className="act-row" aria-hidden={mode !== 'flat'}>
          {total}
          {busiest}
          {longest}
          {current}
        </div>
        <div className="act-row-legend" aria-hidden={mode !== 'flat'}>
          <Legend />
        </div>
      </div>
    </section>
  )
}
