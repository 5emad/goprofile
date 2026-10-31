// Routing helpers over the Next.js router.
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useEffect, type ReactNode } from 'react'

export const routes = {
  dashboard: '/',
  login: '/login/',
  boards: '/boards/',
  board: (id: number) => `/boards/view/?id=${id}`,
  newTask: (boardId?: number) => (boardId ? `/tasks/new/?board=${boardId}` : '/tasks/new/'),
  reports: '/reports/',
  settings: '/settings/',
  profile: '/profile/',
}

const strip = (p: string) => p.replace(/\/+$/, '') || '/'

export function NavLink({ href, end, className, children }: { href: string; end?: boolean; className: (active: boolean) => string; children: ReactNode }) {
  const { asPath } = useRouter()
  const here = strip(asPath.split('?')[0])
  const target = strip(href.split('?')[0])
  const active = end ? here === target : here === target || here.startsWith(target + '/')
  return (
    <Link href={href} className={className(active)} aria-current={active ? 'page' : undefined}>
      {children}
    </Link>
  )
}

/** Redirects on mount; renders nothing. */
export function Redirect({ to }: { to: string }) {
  const router = useRouter()
  useEffect(() => {
    router.replace(to)
  }, [router, to])
  return null
}

/** A query string value once the router is ready. */
export function useQuery(name: string): string | undefined {
  const { query, isReady } = useRouter()
  if (!isReady) return undefined
  const v = query[name]
  return Array.isArray(v) ? v[0] : v
}
