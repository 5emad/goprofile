import { Head, Html, Main, NextScript } from 'next/document'

export default function Document() {
  return (
    <Html lang="fa" dir="rtl">
      <Head>
        <meta name="theme-color" content="#f6f6f1" />
        <meta name="referrer" content="no-referrer" />
        <link rel="icon" type="image/svg+xml" href="/logo.svg" />
        <link rel="apple-touch-icon" href="/icon-512.png" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="application-name" content="گوپروفایل" />
        <meta name="apple-mobile-web-app-title" content="گوپروفایل" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
