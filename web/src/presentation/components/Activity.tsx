import { useEffect, useRef, useState } from 'react'
import type { ActivityGrid, Cell, Summary } from '@/domain/activity'
import { fmtDay } from '@/domain/dates'
import { MONTHS } from '@/domain/jalali'
import { Icon } from './Icon'

const tip = (c: Cell) => `${c.count ? `${c.count} مشارکت` : 'بدون مشارکت'} · ${fmtDay(c.key, true)}`

interface Hover {
  cell: Cell
  x: number
  y: number
}

function Tooltip({ hover }: { hover: Hover | null }) {
  if (!hover) return null
  return (
    <div className="heat-tip" style={{ left: hover.x, top: hover.y }}>
      {tip(hover.cell)}
    </div>
  )
}

/** Flat grid; cells pop in column by column. */
function FlatGrid({ grid, onHover }: { grid: ActivityGrid; onHover: (h: Hover | null) => void }) {
  const size = 12
  const gap = 3
  const left = 56
  const top = 20
  const w = left + grid.weeks.length * (size + gap)
  const h = top + 7 * (size + gap)
  return (
    <svg className="heat-flat" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="جدول فعالیت" onMouseLeave={() => onHover(null)}>
      {grid.monthLabels.map((m) => (
        <text key={m.week} x={left + m.week * (size + gap)} y={11} className="heat-label">
          {MONTHS[m.month - 1]}
        </text>
      ))}
      {[
        [1, 'یکشنبه'],
        [3, 'سه‌شنبه'],
        [5, 'پنجشنبه'],
      ].map(([d, label]) => (
        <text key={label} x={0} y={top + (d as number) * (size + gap) + 9.5} className="heat-label">
          {label}
        </text>
      ))}
      {grid.weeks.map((col, wi) =>
        col.map((c, d) =>
          c.future ? null : (
            <rect
              key={c.key}
              x={left + wi * (size + gap)}
              y={top + d * (size + gap)}
              width={size}
              height={size}
              rx={2.5}
              className={`lv lv${c.level} pop`}
              style={{ animationDelay: `${wi * 14 + d * 8}ms` }}
              onMouseEnter={(e) => {
                const r = (e.target as SVGRectElement).getBoundingClientRect()
                const box = (e.target as SVGRectElement).closest('.heat-stage')!.getBoundingClientRect()
                onHover({ cell: c, x: r.left + r.width / 2 - box.left, y: r.top - box.top })
              }}
            />
          ),
        ),
      )}
    </svg>
  )
}

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()

function shade(hex: string, amount: number) {
  const n = parseInt(hex.replace('#', ''), 16)
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c * (1 - amount))))
  return `rgb(${f(n >> 16)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`
}

// Overshoots a little before settling, like a spring.
const easeOutBack = (t: number) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2

/**
 * Isometric 3D bars on a canvas. Bars rise in a wave from the oldest week to
 * the newest; hovering lifts a bar and shows its day.
 */
function IsoCanvas({ grid, onHover }: { grid: ActivityGrid; onHover: (h: Hover | null) => void }) {
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [width, setWidth] = useState(0)
  const hovered = useRef<string | null>(null)
  const progress = useRef(0)
  const faces = useRef<{ cell: Cell; poly: [number, number][]; top: number; cx: number }[]>([])

  const weeks = grid.weeks.length
  const S = 13
  const ux = S * 0.866
  const uy = S * 0.5
  const maxH = 110
  const natW = 20 + (weeks + 7) * ux
  const natH = 7 * uy + maxH + 14 + weeks * uy + 34

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const cv = canvas.current
    if (!cv || !width) return
    const scale = Math.min(1.4, width / natW)
    const dpr = window.devicePixelRatio || 1
    cv.width = Math.round(natW * scale * dpr)
    cv.height = Math.round(natH * scale * dpr)
    cv.style.width = `${natW * scale}px`
    cv.style.height = `${natH * scale}px`
    const ctx = cv.getContext('2d')!
    const ox = 10
    const oy = 7 * uy + maxH + 14
    const pt = (w: number, d: number): [number, number] => [ox + (w + d) * ux, oy + (w - d) * uy]
    const cells: { c: Cell; w: number; d: number }[] = []
    grid.weeks.forEach((col, w) => col.forEach((c, d) => !c.future && cells.push({ c, w, d })))
    cells.sort((a, b) => a.w - a.d - (b.w - b.d) || a.w - b.w)

    let raf = 0
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const start = performance.now()
    const duration = reduce ? 1 : 1600

    const draw = () => {
      const levels = [0, 1, 2, 3, 4].map((l) => css(`--l${l}`) || '#ebece8')
      const muted = css('--muted') || '#7d8471'
      const edge = css('--surface') || '#fff'
      ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0)
      ctx.clearRect(0, 0, natW, natH)
      ctx.lineJoin = 'round'
      const p = progress.current
      const hit: typeof faces.current = []
      for (const { c, w, d } of cells) {
        const t = Math.min(1, Math.max(0, (p - (w / weeks) * 0.55) / 0.45))
        const grow = t <= 0 ? 0 : easeOutBack(t)
        const lift = hovered.current === c.key ? 6 : 0
        const full = c.count ? 6 + (c.count / Math.max(1, grid.max)) * maxH : 2.5
        const h = c.count ? Math.max(2.5, full * grow) + lift : 2.5 + lift
        const p0 = pt(w, d)
        const p1 = pt(w + 1, d)
        const p2 = pt(w + 1, d + 1)
        const p3 = pt(w, d + 1)
        const base = levels[c.level]
        const poly = (ps: [number, number][], up: number[], fill: string) => {
          ctx.beginPath()
          ps.forEach(([x, y], i) => (i ? ctx.lineTo(x, y - up[i]) : ctx.moveTo(x, y - up[i])))
          ctx.closePath()
          ctx.fillStyle = fill
          ctx.fill()
        }
        const color = base.startsWith('#') ? base : '#ebece8'
        poly([p0, p1, p1, p0], [0, 0, h, h], shade(color, 0.1))
        poly([p1, p2, p2, p1], [0, 0, h, h], shade(color, 0.22))
        poly([p0, p1, p2, p3], [h, h, h, h], hovered.current === c.key ? shade(color, -0.12) : color)
        ctx.strokeStyle = edge
        ctx.globalAlpha = 0.55
        ctx.lineWidth = 0.6
        ctx.stroke()
        ctx.globalAlpha = 1
        hit.push({ cell: c, poly: [p0, p1, p2, p3].map(([x, y]) => [x, y - h]) as [number, number][], top: p0[1] - h, cx: p1[0] })
      }
      ctx.font = '10px IRANYekanX, Tahoma, sans-serif'
      ctx.fillStyle = muted
      ctx.textAlign = 'right'
      for (const m of grid.monthLabels) {
        const [x, y] = pt(m.week, -0.6)
        ctx.fillText(MONTHS[m.month - 1], x + 6, y + 14)
      }
      faces.current = hit
    }

    const tick = (now: number) => {
      progress.current = Math.min(1, (now - start) / duration)
      draw()
      if (progress.current < 1) raf = requestAnimationFrame(tick)
    }
    progress.current = 0
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
    const move = (e: MouseEvent) => {
      const r = cv.getBoundingClientRect()
      const x = (e.clientX - r.left) / scale
      const y = (e.clientY - r.top) / scale
      // Topmost face wins: walk in reverse paint order.
      const f = [...faces.current].reverse().find((f) => inside(x, y, f.poly))
      const key = f?.cell.key ?? null
      if (key !== hovered.current) {
        hovered.current = key
        if (progress.current >= 1) draw()
      }
      const box = wrap.current!.getBoundingClientRect()
      onHover(f ? { cell: f.cell, x: f.cx * scale + r.left - box.left, y: f.top * scale + r.top - box.top - 4 } : null)
    }
    const leave = () => {
      hovered.current = null
      onHover(null)
      if (progress.current >= 1) draw()
    }
    cv.addEventListener('mousemove', move)
    cv.addEventListener('mouseleave', leave)

    // Redraw when the theme changes.
    const mo = new MutationObserver(() => progress.current >= 1 && draw())
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onScheme = () => progress.current >= 1 && draw()
    mq.addEventListener('change', onScheme)

    return () => {
      cancelAnimationFrame(raf)
      cv.removeEventListener('mousemove', move)
      cv.removeEventListener('mouseleave', leave)
      mo.disconnect()
      mq.removeEventListener('change', onScheme)
    }
  }, [grid, width, natW, natH, ux, uy, weeks, onHover])

  return (
    <div ref={wrap} className="iso-canvas-wrap">
      <canvas ref={canvas} role="img" aria-label="نمای سه‌بعدی فعالیت" />
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
      const t = Math.min(1, (now - start) / 1100)
      setShown(Math.round(value * (1 - (1 - t) ** 3)))
      if (t < 1) raf = requestAnimationFrame(step)
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

export function ActivityCard({ grid, summary, name }: { grid: ActivityGrid; summary: Summary; from: string; today: string; name: string }) {
  const [mode, setMode] = useState<'flat' | 'iso'>(() => {
    try {
      return localStorage.getItem('gp.heat') === 'flat' ? 'flat' : 'iso'
    } catch {
      return 'iso'
    }
  })
  const [hover, setHover] = useState<Hover | null>(null)
  const pick = (m: 'flat' | 'iso') => {
    setMode(m)
    setHover(null)
    try {
      localStorage.setItem('gp.heat', m)
    } catch {
      /* ignore */
    }
  }
  const scroller = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth
  }, [mode])

  return (
    <section className="card activity">
      <header className="activity-head">
        <span className="activity-handle">
          <bdi>@</bdi>
          <bdi>{name}</bdi>
        </span>
        <div className="seg" role="tablist" aria-label="نوع نمایش">
          <button role="tab" aria-selected={mode === 'flat'} className={mode === 'flat' ? 'on' : ''} onClick={() => pick('flat')} title="نمای جدولی">
            <Icon name="grid" size={16} />
          </button>
          <button role="tab" aria-selected={mode === 'iso'} className={mode === 'iso' ? 'on' : ''} onClick={() => pick('iso')} title="نمای سه‌بعدی">
            <Icon name="cube" size={16} />
          </button>
        </div>
      </header>

      <div className="activity-panel">
        <div className="heat-stage" key={mode}>
          {mode === 'flat' ? (
            <div className="heat-scroll" ref={scroller}>
              <FlatGrid grid={grid} onHover={setHover} />
            </div>
          ) : (
            <IsoCanvas grid={grid} onHover={setHover} />
          )}
          <Tooltip hover={hover} />
        </div>

        <div className="activity-total">
          <span className="muted">مجموع مشارکت‌ها</span>
          <b>
            <CountUp value={summary.total} />
          </b>
        </div>

        <div className="activity-stats">
          <div>
            <span className="muted">بیشترین فعالیت</span>
            <p>
              <b>
                <CountUp value={summary.busiest?.count ?? 0} />
              </b>
              <small>مشارکت{summary.busiest ? ` · ${fmtDay(summary.busiest.key)}` : ''}</small>
            </p>
          </div>
          <div>
            <span className="muted">رکورد تداوم</span>
            <p>
              <b>
                <CountUp value={summary.longest?.length ?? 0} />
              </b>
              <small>روز</small>
            </p>
          </div>
          <div>
            <span className="muted">تداوم فعلی</span>
            <p>
              <b>
                <CountUp value={summary.current?.length ?? 0} />
              </b>
              <small>روز</small>
            </p>
          </div>
        </div>
      </div>
      <Legend />
    </section>
  )
}
