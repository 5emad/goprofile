import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { authRepo } from '@/data/repositories'
import { Logo } from '../components/Logo'
import { Field } from '../components/ui'
import { useApp } from '../store'

function useLoginVM() {
  const { setUser } = useApp()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async (f: { name: string; email: string; password: string }) => {
    setBusy(true)
    setError('')
    try {
      setUser(mode === 'login' ? await authRepo.login(f.email, f.password) : await authRepo.register(f.name, f.email, f.password))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return { mode, setMode, busy, error, submit }
}

export function Login() {
  const { user } = useApp()
  const vm = useLoginVM()
  const [f, setF] = useState({ name: '', email: '', password: '' })
  if (user) return <Navigate to="/" replace />
  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    vm.submit(f)
  }
  return (
    <div className="auth">
      <div className="auth-art" aria-hidden="true">
        {Array.from({ length: 7 * 18 }, (_, i) => (
          <i key={i} className={`lv-swatch lv${[0, 0, 1, 0, 2, 0, 3, 1, 0, 4, 2, 0][(i * 7 + (i >> 3)) % 12]}`} style={{ animationDelay: `${(i % 18) * 40}ms` }} />
        ))}
      </div>
      <form className="auth-card" onSubmit={onSubmit}>
        <Logo size={56} />
        <h1>{vm.mode === 'login' ? 'خوش برگشتی' : 'ساخت حساب'}</h1>
        <p className="muted">کارهایت را ثبت کن، زمانت را لاگ بزن و رشدت را ببین.</p>
        {vm.mode === 'register' && (
          <Field label="نام">
            <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required maxLength={80} autoComplete="name" />
          </Field>
        )}
        <Field label="ایمیل">
          <input className="input ltr" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required autoComplete="email" />
        </Field>
        <Field label="رمز عبور" hint={vm.mode === 'register' ? 'حداقل ۱۰ کاراکتر' : undefined}>
          <input
            className="input ltr"
            type="password"
            value={f.password}
            onChange={(e) => setF({ ...f, password: e.target.value })}
            required
            minLength={vm.mode === 'register' ? 10 : 1}
            autoComplete={vm.mode === 'login' ? 'current-password' : 'new-password'}
          />
        </Field>
        {vm.error && <div className="alert">{vm.error}</div>}
        <button className="btn btn-primary btn-block" disabled={vm.busy}>
          {vm.busy ? 'لطفاً صبر کنید…' : vm.mode === 'login' ? 'ورود' : 'ثبت‌نام'}
        </button>
        <button type="button" className="btn-link" onClick={() => vm.setMode(vm.mode === 'login' ? 'register' : 'login')}>
          {vm.mode === 'login' ? 'حساب نداری؟ ثبت‌نام کن' : 'حساب داری؟ وارد شو'}
        </button>
      </form>
    </div>
  )
}
