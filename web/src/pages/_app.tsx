import type { AppProps } from 'next/app'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import '@/styles/fonts.css'
import '@/styles/app.css'
import { Seo } from '@/presentation/components/Seo'
import { Toaster, toast } from '@/presentation/components/Toaster'
import { Spinner } from '@/presentation/components/ui'
import { Redirect, routes } from '@/presentation/nav'
import { AppProvider, useApp } from '@/presentation/store'
import { Layout } from '@/presentation/views/Layout'

const PUBLIC = new Set(['/login'])
// Rendered into the exported HTML, without the app state, so search engines see real content.
const STATIC = new Set(['/', '/404'])

function Shell({ Component, pageProps }: AppProps) {
  const { user, loading } = useApp()
  const { pathname } = useRouter()
  if (PUBLIC.has(pathname)) {
    return (
      <>
        <Seo title="ورود و ثبت‌نام" description="ورود یا ساخت حساب رایگان در گوپروفایل برای ثبت فعالیت، تایمر کار و گزارش کارکرد." path="/login/" />
        <Component {...pageProps} />
      </>
    )
  }
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
      <Seo title="داشبورد" path={pathname} noindex />
      <Component {...pageProps} />
    </Layout>
  )
}

export default function App(props: AppProps) {
  const { pathname } = useRouter()
  // The app runs entirely in the browser: crypto keys, the session and the
  // clock live there, so the exported HTML is only a loading shell.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (STATIC.has(pathname)) {
    const { Component, pageProps } = props
    return (
      <>
        <Head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
        </Head>
        <Component {...pageProps} />
      </>
    )
  }
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
