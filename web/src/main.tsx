import { StrictMode, useCallback, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import './styles/fonts.css'
import './styles/app.css'
import { Spinner } from './presentation/components/ui'
import { AppProvider, useApp } from './presentation/store'
import { BoardView, Boards } from './presentation/views/Boards'
import { Dashboard } from './presentation/views/Dashboard'
import { Layout } from './presentation/views/Layout'
import { Login } from './presentation/views/Login'
import { NewTask } from './presentation/views/NewTask'
import { Reports } from './presentation/views/Reports'
import { Profile, Settings } from './presentation/views/Settings'

function Protected() {
  const { user, loading } = useApp()
  if (loading) return <div className="boot"><Spinner /></div>
  if (!user) return <Navigate to="/login" replace />
  return <Layout />
}

function Root() {
  const [toasts, setToasts] = useState<{ id: number; msg: string; kind: 'ok' | 'err' }[]>([])
  const onToast = useCallback((msg: string, kind: 'ok' | 'err') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, msg, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500)
  }, [])
  return (
    <AppProvider onToast={onToast}>
      <HashRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<Protected />}>
            <Route index element={<Dashboard />} />
            <Route path="boards" element={<Boards />} />
            <Route path="boards/:id" element={<BoardView />} />
            <Route path="tasks/new" element={<NewTask />} />
            <Route path="reports" element={<Reports />} />
            <Route path="settings" element={<Settings />} />
            <Route path="profile" element={<Profile />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
      <div className="toasts" role="status">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.msg}
          </div>
        ))}
      </div>
    </AppProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
