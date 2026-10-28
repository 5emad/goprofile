import type { Compare, MonthBucket } from '@/domain/activity'
import { fmtDay, fmtDuration, hoursLabel, weekday } from '@/domain/dates'
import type { DayStat } from '@/domain/entities'
import { MONTHS, WEEKDAYS } from '@/domain/jalali'
import { Icon } from './Icon'

function niceMax(v: number) {
  if (v <= 0) return 1
  const p = 10 ** Math.floor(Math.log10(v))
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p
  return 10 * p
}

/** Bars for logged hours per month, with a dot line for completed tasks. */
export function MonthlyChart({ months }: { months: MonthBucket[] }) {
  const W = 640
  const H = 220
  const pad = { l: 34, r: 34, t: 16, b: 30 }
  const iw = W - pad.l - pad.r
  const ih = H - pad.t - pad.b
  const hours = months.map((m) => m.seconds / 3600)
  const maxH = niceMax(Math.max(...hours))
  const maxD = niceMax(Math.max(...months.map((m) => m.done)))
  const bw = iw / months.length
  const ticks = [0, 0.25, 0.5, 0.75, 1]
  const line = months.map((m, i) => `${pad.l + bw * i + bw / 2},${pad.t + ih - (m.done / maxD) * ih}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="نمودار ماهانه">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={pad.t + ih - t * ih} y2={pad.t + ih - t * ih} className="grid-line" />
          <text x={pad.l - 6} y={pad.t + ih - t * ih + 4} className="axis" textAnchor="end">
            {hoursLabel(t * maxH * 3600)}
          </text>
          <text x={W - pad.r + 6} y={pad.t + ih - t * ih + 4} className="axis" textAnchor="start">
            {Math.round(t * maxD)}
          </text>
        </g>
      ))}
      {months.map((m, i) => {
        const h = (hours[i] / maxH) * ih
        return (
          <g key={`${m.jy}-${m.jm}`}>
            <rect x={pad.l + bw * i + bw * 0.2} y={pad.t + ih - h} width={bw * 0.6} height={Math.max(h, 0.5)} rx={4} className={i === months.length - 1 ? 'bar bar-now' : 'bar'}>
              <title>{`${MONTHS[m.jm - 1]} ${m.jy}: ${fmtDuration(m.seconds)} — ${m.done} تسک انجام‌شده`}</title>
            </rect>
            <text x={pad.l + bw * i + bw / 2} y={H - 10} className="axis" textAnchor="middle">
              {MONTHS[m.jm - 1]}
            </text>
          </g>
        )
      })}
      <polyline points={line} className="done-line" />
      {months.map((m, i) => (
        <circle key={i} cx={pad.l + bw * i + bw / 2} cy={pad.t + ih - (m.done / maxD) * ih} r={3.5} className="done-dot" />
      ))}
    </svg>
  )
}

/** Logged hours for the last 14 days. */
export function DaysChart({ days, goalSeconds }: { days: DayStat[]; goalSeconds: number }) {
  const W = 640
  const H = 180
  const pad = { l: 30, r: 8, t: 12, b: 30 }
  const iw = W - pad.l - pad.r
  const ih = H - pad.t - pad.b
  const max = niceMax(Math.max(goalSeconds, ...days.map((d) => d.seconds)) / 3600)
  const bw = iw / days.length
  const y = (sec: number) => pad.t + ih - (sec / 3600 / max) * ih
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="ساعات کار دو هفته اخیر">
      {[0, 0.5, 1].map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={pad.t + ih - t * ih} y2={pad.t + ih - t * ih} className="grid-line" />
          <text x={pad.l - 6} y={pad.t + ih - t * ih + 4} className="axis" textAnchor="end">
            {hoursLabel(t * max * 3600)}
          </text>
        </g>
      ))}
      {goalSeconds > 0 && <line x1={pad.l} x2={W - pad.r} y1={y(goalSeconds)} y2={y(goalSeconds)} className="goal-line" />}
      {days.map((d, i) => (
        <g key={d.d}>
          <rect x={pad.l + bw * i + bw * 0.22} y={y(d.seconds)} width={bw * 0.56} height={Math.max(0.5, pad.t + ih - y(d.seconds))} rx={3} className={i === days.length - 1 ? 'bar bar-now' : 'bar'}>
            <title>{`${fmtDay(d.d)}: ${fmtDuration(d.seconds)}`}</title>
          </rect>
          <text x={pad.l + bw * i + bw / 2} y={H - 10} className="axis" textAnchor="middle">
            {WEEKDAYS[weekday(d.d)].slice(0, 1)}
          </text>
        </g>
      ))}
    </svg>
  )
}

export function CompareCard({ title, c, format, icon }: { title: string; c: Compare; format: (n: number) => string; icon: string }) {
  const up = c.today >= c.yesterday
  return (
    <div className="card compare">
      <div className="compare-head">
        <span className="compare-icon">
          <Icon name={icon} size={16} />
        </span>
        {title}
      </div>
      <div className="compare-value">{format(c.today)}</div>
      <div className={`compare-delta ${c.today === c.yesterday ? '' : up ? 'up' : 'down'}`}>
        {c.today !== c.yesterday && <Icon name={up ? 'up' : 'down'} size={13} />}
        {c.delta === null ? (c.today ? 'دیروز صفر بود' : 'بدون تغییر') : `${Math.abs(c.delta)}٪ ${up ? 'بیشتر' : 'کمتر'} از دیروز`}
        <span className="muted"> · دیروز {format(c.yesterday)}</span>
      </div>
    </div>
  )
}

export function GoalRing({ ratio, label }: { ratio: number; label: string }) {
  const r = 34
  const len = 2 * Math.PI * r
  return (
    <div className="goal">
      <svg viewBox="0 0 84 84" width="84" height="84">
        <circle cx="42" cy="42" r={r} className="ring-bg" />
        <circle cx="42" cy="42" r={r} className="ring" strokeDasharray={`${len * ratio} ${len}`} transform="rotate(-90 42 42)" />
        <text x="42" y="47" textAnchor="middle" className="ring-text">
          {Math.round(ratio * 100)}٪
        </text>
      </svg>
      <div>
        <div className="stat-label">هدف روزانه</div>
        <div className="goal-label">{label}</div>
      </div>
    </div>
  )
}
