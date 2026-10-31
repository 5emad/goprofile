import Head from 'next/head'

export const SITE_URL = 'https://goprofile.ir'
export const SITE_NAME = 'گوپروفایل'

/** Title, description, canonical URL and social cards for one page. */
export function Seo({ title, description, path, noindex }: { title: string; description?: string; path: string; noindex?: boolean }) {
  const full = title === SITE_NAME ? title : `${title} | ${SITE_NAME}`
  const url = SITE_URL + path
  return (
    <Head>
      <title>{full}</title>
      {noindex ? (
        <meta name="robots" content="noindex, nofollow" />
      ) : (
        <>
          <meta name="robots" content="index, follow, max-image-preview:large" />
          <link rel="canonical" href={url} />
        </>
      )}
      {description && <meta name="description" content={description} />}
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:locale" content="fa_IR" />
      <meta property="og:title" content={full} />
      {description && <meta property="og:description" content={description} />}
      <meta property="og:url" content={url} />
      <meta property="og:image" content={`${SITE_URL}/og.png`} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={full} />
      {description && <meta name="twitter:description" content={description} />}
      <meta name="twitter:image" content={`${SITE_URL}/og.png`} />
    </Head>
  )
}
