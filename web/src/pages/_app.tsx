import type { AppProps } from 'next/app'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import '@/styles/fonts.css'
import '@/styles/app.css'
import { Toaster, toast } from '@/presentation/components/Toaster'
import { Spinner } from '@/presentation/components/ui'
import { Redirect, routes } from '@/presentation/nav'
import { AppProvider, useApp } from '@/presentation/store'
import { Layout } from '@/presentation/views/Layout'

const PUBLIC = new Set(['/login'])

function Shell({ Component, pageProps }: AppProps) {
  const { user, loading } = useApp()
  const { pathname } = useRouter()
  if (PUBLIC.has(pathname)) return <Component {...pageProps} />
  if (loading) {
    return (
      <div className="boot">
        <Spinner />
      </div>
    )
  }
  if (!user) return <Redirect to={routes.login} />
  return (
    <Layout>
      <Component {...pageProps} />
    </Layout>
  )
}

export default function App(props: AppProps) {
  // The app runs entirely in the browser: crypto keys, the session and the
  // clock live there, so the exported HTML is only a loading shell.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  return (
    <>
      <Head>
        <title>گوپروفایل</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
      </Head>
      {mounted ? (
        <AppProvider onToast={toast}>
          <Shell {...props} />
          <Toaster />
        </AppProvider>
      ) : (
        <div className="boot">
          <Spinner />
        </div>
      )}
    </>
  )
}
