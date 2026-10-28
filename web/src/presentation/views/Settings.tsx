import { useState, type FormEvent } from 'react'
import { authRepo, statsRepo } from '@/data/repositories'
import { summarize } from '@/domain/activity'
import { fmtDay } from '@/domain/dates'
import type { Settings as S } from '@/domain/entities'
import { Field } from '../components/ui'
import { useApp } from '../store'
import { useAsync } from '../viewmodels/useAsync'
import { PageHead } from './Layout'

const ZONES = ['Asia/Tehran', 'Asia/Dubai', 'Europe/Istanbul', 'Europe/Berlin', 'Europe/London', 'America/New_York', 'America/Toronto', 'UTC']

function useSettingsVM() {
  const { user, setUser, toast } = useApp()
  const save = async (patch: Partial<S>) => {
    try {
      setUser(await authRepo.updateSettings({ ...user!.settings, ...patch }))
      toast('تنظیمات ذخیره شد')
    } catch (e) {
      toast((e as Error).message, 'err')
    }
  }
  return { settings: user!.settings, save }
}

export function Settings() {
  const vm = useSettingsVM()
  const s = vm.settings
  return (
    <div className="page page-narrow">
      <PageHead title="تنظیمات" />
      <section className="card setting-list">
        <div className="setting">
          <div>
            <b>حالت جیرا</b>
            <p className="muted">در ایجاد تسک فیلد «شماره تسک جیرا» نمایش داده می‌شود و همه‌جا شماره جیرا جای کلید داخلی را می‌گیرد.</p>
          </div>
          <label className="switch">
            <input type="checkbox" checked={s.jira_mode} onChange={(e) => vm.save({ jira_mode: e.target.checked })} />
            <span />
          </label>
        </div>
        <div className="setting">
          <div>
            <b>پوسته</b>
            <p className="muted">روشن، تیره یا هماهنگ با سیستم</p>
          </div>
          <div className="seg seg-text">
            {(
              [
                ['system', 'سیستم'],
                ['light', 'روشن'],
                ['dark', 'تیره'],
              ] as const
            ).map(([v, l]) => (
              <button key={v} className={s.theme === v ? 'on' : ''} onClick={() => vm.save({ theme: v })}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className="setting">
          <div>
            <b>هدف روزانه</b>
            <p className="muted">چند ساعت در روز می‌خواهی کار ثبت کنی؟</p>
          </div>
          <select className="input input-auto" value={s.daily_goal_minutes} onChange={(e) => vm.save({ daily_goal_minutes: Number(e.target.value) })}>
            <option value={0}>بدون هدف</option>
            {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((h) => (
              <option key={h} value={h * 60}>
                {h} ساعت
              </option>
            ))}
          </select>
        </div>
        <div className="setting">
          <div>
            <b>منطقه زمانی</b>
            <p className="muted">روزها و گزارش‌ها بر این اساس محاسبه می‌شوند</p>
          </div>
          <select className="input input-auto ltr" value={s.timezone} onChange={(e) => vm.save({ timezone: e.target.value })}>
            {(ZONES.includes(s.timezone) ? ZONES : [s.timezone, ...ZONES]).map((z) => (
              <option key={z}>{z}</option>
            ))}
          </select>
        </div>
      </section>
      <SecurityCard />
    </div>
  )
}

function SecurityCard() {
  const { toast } = useApp()
  const [f, setF] = useState({ current: '', next: '', confirm: '' })
  const [err, setErr] = useState('')
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (f.next !== f.confirm) return setErr('تکرار رمز یکسان نیست')
    try {
      await authRepo.changePassword(f.current, f.next)
      setF({ current: '', next: '', confirm: '' })
      setErr('')
      toast('رمز عوض شد و بقیه دستگاه‌ها خارج شدند')
    } catch (e) {
      setErr((e as Error).message)
    }
  }
  return (
    <section className="card">
      <h2>امنیت</h2>
      <form onSubmit={submit} className="task-form">
        <div className="form-grid">
          <Field label="رمز فعلی">
            <input className="input ltr" type="password" autoComplete="current-password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} required />
          </Field>
          <Field label="رمز جدید" hint="حداقل ۱۰ کاراکتر">
            <input className="input ltr" type="password" autoComplete="new-password" minLength={10} value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} required />
          </Field>
          <Field label="تکرار رمز جدید">
            <input className="input ltr" type="password" autoComplete="new-password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} required />
          </Field>
        </div>
        {err && <div className="alert">{err}</div>}
        <div className="form-actions">
          <button
            type="button"
            className="btn"
            onClick={() =>
              authRepo
                .logoutOthers()
                .then((r) => toast(`${r.removed} نشست دیگر بسته شد`))
                .catch((e) => toast(e.message, 'err'))
            }
          >
            خروج از دستگاه‌های دیگر
          </button>
          <button className="btn btn-primary">تغییر رمز</button>
        </div>
      </form>
    </section>
  )
}

export function Profile() {
  const { user, setUser, toast, version } = useApp()
  const [name, setName] = useState(user!.name)
  const stats = useAsync(() => statsRepo.daily(371), [version])
  const sum = stats.data ? summarize(stats.data.days, stats.data.today) : null
  const hours = stats.data ? Math.round(stats.data.days.reduce((s, d) => s + d.seconds, 0) / 3600) : 0
  const done = stats.data ? stats.data.days.reduce((s, d) => s + d.done, 0) : 0
  return (
    <div className="page page-narrow">
      <PageHead title="پروفایل" />
      <section className="card profile-card">
        <div className="avatar avatar-lg">{user!.name.slice(0, 1)}</div>
        <div className="profile-info">
          <h2>{user!.name}</h2>
          <span className="muted ltr">{user!.email}</span>
          <span className="muted small">عضو از {fmtDay(user!.created_at.slice(0, 10), true)}</span>
        </div>
      </section>
      <div className="week-summary">
        <div className="card stat-card">
          <div className="stat-label">ساعت ثبت‌شده (یک سال)</div>
          <div className="stat-value">{hours}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-label">تسک انجام‌شده</div>
          <div className="stat-value">{done}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-label">مجموع مشارکت</div>
          <div className="stat-value">{sum?.total ?? 0}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-label">طولانی‌ترین تداوم</div>
          <div className="stat-value">{sum?.longest?.length ?? 0} روز</div>
        </div>
      </div>
      <section className="card">
        <form
          className="manual-row"
          onSubmit={async (e) => {
            e.preventDefault()
            try {
              setUser(await authRepo.updateProfile(name))
              toast('پروفایل ذخیره شد')
            } catch (err) {
              toast((err as Error).message, 'err')
            }
          }}
        >
          <Field label="نام نمایشی">
            <input className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          </Field>
          <button className="btn btn-primary">ذخیره</button>
        </form>
      </section>
    </div>
  )
}
