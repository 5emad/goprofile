import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { ActivityGrid, Cell, Summary } from '@/domain/activity'
import { fmtDay } from '@/domain/dates'
import { MONTHS } from '@/domain/jalali'
import { Icon } from './Icon'

const tip = (c: Cell) => `${c.count ? `${c.count} مشارکت` : 'بدون مشارکت'} — ${fmtDay(c.key, true)}`

function FlatGrid({ grid }: { grid: ActivityGrid }) {
  const size = 12
  const gap = 3
  const left = 56
  const top = 20
  const w = left + grid.weeks.length * (size + gap)
  const h = top + 7 * (size + gap)
  return (
    <svg className="heat-flat" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="جدول فعالیت">
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
      {grid.weeks.map((col, w) =>
        col.map((c, d) =>
          c.future ? null : (
            <rect key={c.key} x={left + w * (size + gap)} y={top + d * (size + gap)} width={size} height={size} rx={2.5} className={`lv lv${c.level}`}>
              <title>{tip(c)}</title>
            </rect>
          ),
        ),
      )}
    </svg>
  )
}

function IsoGrid({ grid }: { grid: ActivityGrid }) {
  // Weeks run toward the viewer's bottom-right, weekdays toward the top-right.
  const s = 13
  const ux = s * 0.866
  const uy = s * 0.5
  const maxH = 120
  const weeks = grid.weeks.length
  const ox = 10
  const oy = 7 * uy + maxH + 8
  const pt = (w: number, d: number) => [ox + (w + d) * ux, oy + (w - d) * uy] as const
  const cells: { c: Cell; w: number; d: number }[] = []
  grid.weeks.forEach((col, w) => col.forEach((c, d) => !c.future && cells.push({ c, w, d })))
  // Painter's order: far cells first.
  cells.sort((a, b) => a.w - a.d - (b.w - b.d) || a.w - b.w)
  const width = ox + (weeks + 7) * ux + 10
  const height = oy + weeks * uy + 30

  return (
    <svg className="heat-iso" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="نمای سه‌بعدی فعالیت">
      {cells.map(({ c, w, d }) => {
        const h = c.count ? 6 + (c.count / Math.max(1, grid.max)) * maxH : 2.5
        const p0 = pt(w, d)
        const p1 = pt(w + 1, d)
        const p2 = pt(w + 1, d + 1)
        const p3 = pt(w, d + 1)
        const poly = (pts: (readonly [number, number])[], dy: number[]) => pts.map(([x, y], i) => `${x},${y - dy[i]}`).join(' ')
        const inset = 0.8
        return (
          <g key={c.key} className={`iso lv${c.level}`}>
            <title>{tip(c)}</title>
            <polygon points={poly([p0, p1, p1, p0], [0, 0, h, h])} className="lv-fill shade-1" transform={`translate(${inset},0)`} />
            <polygon points={poly([p1, p2, p2, p1], [0, 0, h, h])} className="lv-fill shade-2" transform={`translate(-${inset},0)`} />
            <polygon points={poly([p0, p1, p2, p3], [h, h, h, h])} className="lv-fill" />
          </g>
        )
      })}
      {grid.monthLabels.map((m) => {
        const [x, y] = pt(m.week, -0.6)
        return (
          <text key={m.week} x={x - 6} y={y + 12} className="heat-label">
            {MONTHS[m.month - 1]}
          </text>
        )
      })}
    </svg>
  )
}

function Stat({ label, value, unit, sub, big }: { label: string; value: string | number; unit: string; sub?: string; big?: boolean }) {
  return (
    <div className={`stat ${big ? 'stat-big' : ''}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-row">
        <span className="stat-value">{value}</span>
        <span className="stat-unit">
          {unit}
          {sub && <small>{sub}</small>}
        </span>
      </div>
    </div>
  )
}

/** Horizontal scroller that starts at the newest (rightmost) weeks. */
function HeatScroll({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.scrollLeft = ref.current.scrollWidth
  }, [])
  return (
    <div className="heat-scroll" ref={ref}>
      {children}
    </div>
  )
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

export function ActivityCard({ grid, summary, from, today, name }: { grid: ActivityGrid; summary: Summary; from: string; today: string; name: string }) {
  const [mode, setMode] = useState<'flat' | 'iso'>(() => {
    try {
      return localStorage.getItem('gp.heat') === 'iso' ? 'iso' : 'flat'
    } catch {
      return 'flat'
    }
  })
  const pick = (m: 'flat' | 'iso') => {
    setMode(m)
    try {
      localStorage.setItem('gp.heat', m)
    } catch {
      /* ignore */
    }
  }
  const range = `${fmtDay(from, true)} — ${fmtDay(today, true)}`
  const stats = (
    <>
      <Stat big label="مجموع مشارکت‌ها" value={summary.total} unit="مشارکت" sub={range} />
      <Stat label="پرفعالیت‌ترین روز" value={summary.busiest?.count ?? 0} unit="مشارکت" sub={summary.busiest ? fmtDay(summary.busiest.key) : '—'} />
    </>
  )
  const streaks = (
    <>
      <Stat
        label="طولانی‌ترین تداوم"
        value={summary.longest?.length ?? 0}
        unit="روز"
        sub={summary.longest ? `${fmtDay(summary.longest.from)} — ${fmtDay(summary.longest.to)}` : '—'}
      />
      <Stat
        label="تداوم فعلی"
        value={summary.current?.length ?? 0}
        unit="روز"
        sub={summary.current ? `${fmtDay(summary.current.from)} — ${fmtDay(summary.current.to)}` : '—'}
      />
    </>
  )

  return (
    <section className="card activity">
      <header className="card-head">
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
      {mode === 'flat' ? (
        <div className="inner fade-in" key="flat">
          <HeatScroll>
            <FlatGrid grid={grid} />
          </HeatScroll>
          <div className="stats-row">
            {stats}
            {streaks}
          </div>
          <Legend />
        </div>
      ) : (
        <div className="inner iso-wrap fade-in" key="iso">
          <div className="iso-stats-top">{stats}</div>
          <HeatScroll>
            <IsoGrid grid={grid} />
          </HeatScroll>
          <div className="iso-stats-bottom">
            {streaks}
            <Legend />
          </div>
        </div>
      )}
    </section>
  )
}
