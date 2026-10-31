// Public home page. It is exported as real HTML (not the app's loading shell) so search engines can read it.
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Icon } from '../components/Icon'
import { Logo } from '../components/Logo'
import { Seo, SITE_NAME, SITE_URL } from '../components/Seo'
import { routes } from '../nav'

const DESCRIPTION =
  'گوپروفایل؛ ثبت فعالیت روزانه با تایمر و لاگ دستی، کارتابل کارها به سبک جیرا، هشدار سررسید و گزارش کارکرد روزانه، هفتگی، ماهانه و سالانه با خروجی PDF. وب و اپ اندروید.'

const FEATURES = [
  { icon: 'clock', title: 'تایمر و لاگ دستی', text: 'زمان کار را با یک لمس شروع و متوقف کنید یا بعداً دستی ثبت کنید؛ هر لاگ با تاریخ، ساعت و توضیح ذخیره می‌شود.' },
  { icon: 'board', title: 'کارتابل به سبک جیرا', text: 'وضعیت‌ها، فازها، Epicها و دسته‌بندی‌های خودتان را بسازید و کارها را با کشیدن جابه‌جا کنید.' },
  { icon: 'alert', title: 'هشدار سررسید', text: 'کارهایی که سررسیدشان گذشته قرمز و کارهایی که نزدیک سررسیدند نارنجی نمایش داده می‌شوند.' },
  { icon: 'report', title: 'گزارش و تحلیل کارکرد', text: 'کارکرد روزانه، هفتگی، ماهانه و سالانه با مقایسه دوره قبل، خط زمانی، سهم هر تسک و جمع‌بندی متنی.' },
  { icon: 'print', title: 'خروجی PDF خوانا', text: 'گزارش A4 آماده چاپ با تقویم شمسی و فونت فارسی، مناسب ارائه به مدیر یا کارفرما.' },
  { icon: 'grid', title: 'نمودار فعالیت', text: 'جدول مشارکت شبیه گیت‌هاب در نمای دو و سه بعدی، تداوم روزهای کاری و هدف روزانه.' },
]

const FAQ = [
  { q: 'گوپروفایل چیست؟', a: 'یک سامانه ثبت فعالیت و زمان کار است که کارها، زمان صرف‌شده و گزارش کارکرد شما را در وب و اپ اندروید یکجا نگه می‌دارد.' },
  { q: 'زمان کار را چطور ثبت کنم؟', a: 'روی هر تسک تایمر را شروع کنید؛ با «توقف» زمان ثبت می‌شود و با «تکمیل» تسک هم انجام‌شده می‌شود. اگر یادتان رفت، زمان را با تاریخ و ساعت به‌صورت دستی وارد کنید.' },
  { q: 'می‌توانم گزارش کارکرد ماهانه بگیرم؟', a: 'بله. گزارش روزانه، هفتگی، ماهانه و سالانه شمسی با نمودار، خط زمانی، فهرست کارهای انجام‌شده و مانده و خروجی PDF در دسترس است.' },
  { q: 'اطلاعاتم امن است؟', a: 'ارتباط روی HTTPS است و هر درخواست علاوه بر آن با رمزنگاری کلید عمومی (ECDH و AES-256-GCM) رمز می‌شود. رمز عبور با Argon2id ذخیره می‌شود.' },
  { q: 'اپ موبایل دارد؟', a: 'بله، اپ اندروید و ویندوز با همان حساب کار می‌کنند و داده‌ها روی سرور همگام هستند؛ با به‌روزرسانی اپ چیزی پاک نمی‌شود.' },
]

const LD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'SoftwareApplication',
      name: SITE_NAME,
      alternateName: 'goprofile',
      url: SITE_URL,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web, Android, Windows',
      inLanguage: 'fa',
      description: DESCRIPTION,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'IRR' },
    },
    {
      '@type': 'FAQPage',
      mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
    },
  ],
}

export function Landing() {
  // A saved session means a returning user: offer the dashboard instead of sign-up.
  const [signedIn, setSignedIn] = useState(false)
  useEffect(() => {
    try {
      setSignedIn(!!localStorage.getItem('gp.token'))
    } catch {
      /* storage blocked */
    }
  }, [])
  const cta = signedIn ? { href: routes.dashboard, label: 'ورود به داشبورد' } : { href: routes.login, label: 'شروع رایگان' }

  return (
    <div className="landing">
      <Seo title="گوپروفایل؛ ثبت فعالیت، تایمر کار و گزارش کارکرد" description={DESCRIPTION} path="/" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(LD) }} />

      <header className="ld-nav">
        <Logo size={34} withText />
        <nav>
          <a href="#features">امکانات</a>
          <a href="#faq">پرسش‌ها</a>
          <Link href={cta.href} className="btn btn-primary btn-sm">
            {signedIn ? 'داشبورد' : 'ورود / ثبت‌نام'}
          </Link>
        </nav>
      </header>

      <main>
        <section className="ld-hero">
          <div className="ld-hero-text">
            <h1>کارهایت را ثبت کن، زمانت را لاگ بزن و رشدت را ببین</h1>
            <p>
              گوپروفایل تایمر کار، لاگ زمان، کارتابل کارها و گزارش کارکرد را یکجا جمع کرده است؛ با تقویم شمسی، هشدار سررسید و خروجی PDF آماده
              چاپ، در وب و اپ اندروید.
            </p>
            <div className="ld-cta">
              <Link href={cta.href} className="btn btn-primary">
                {cta.label}
              </Link>
              <a href="#features" className="btn">
                امکانات
              </a>
            </div>
          </div>
          <div className="ld-hero-art" aria-hidden="true">
            <div className="ld-timer">
              <span className="muted small">فعالیت جاری</span>
              <b className="ltr">GP-12</b>
              <span>گزارش ماهانه مشتری</span>
              <div className="ld-ring">
                <span className="ltr">00:35:24</span>
              </div>
            </div>
            <div className="ld-grid">
              {Array.from({ length: 7 * 16 }, (_, i) => (
                <i key={i} className={`lv${[0, 1, 0, 2, 3, 0, 1, 4, 2, 0, 3, 1][(i * 5 + (i >> 2)) % 12]}`} />
              ))}
            </div>
          </div>
        </section>

        <section id="features" className="ld-section">
          <h2>هرچه برای مدیریت زمان کار لازم دارید</h2>
          <div className="ld-features">
            {FEATURES.map((f) => (
              <article key={f.title} className="card ld-feature">
                <span className="compare-icon">
                  <Icon name={f.icon} size={18} />
                </span>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="ld-section ld-steps">
          <h2>در سه قدم</h2>
          <ol>
            <li>
              <b>کارتابل بسازید</b> و تسک‌ها را با سررسید و اولویت اضافه کنید.
            </li>
            <li>
              <b>تایمر را روشن کنید</b> یا زمان را دستی ثبت کنید.
            </li>
            <li>
              <b>گزارش بگیرید</b>؛ روزانه تا سالانه، با PDF آماده چاپ.
            </li>
          </ol>
        </section>

        <section id="faq" className="ld-section">
          <h2>پرسش‌های پرتکرار</h2>
          <div className="ld-faq">
            {FAQ.map((f) => (
              <details key={f.q} className="card">
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="ld-section ld-final">
          <h2>از امروز زمان کارت را بشناس</h2>
          <Link href={cta.href} className="btn btn-primary">
            {cta.label}
          </Link>
        </section>
      </main>

      <footer className="ld-foot muted small">© {SITE_NAME} · goprofile.ir</footer>
    </div>
  )
}
