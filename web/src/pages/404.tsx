import Link from 'next/link'
import { Seo } from '@/presentation/components/Seo'
import { Empty } from '@/presentation/components/ui'

export default function NotFound() {
  return (
    <div className="page page-narrow">
      <Seo title="صفحه پیدا نشد" path="/404/" noindex />
      <Empty title="این صفحه پیدا نشد">
        <Link href="/" className="btn">
          بازگشت به صفحه اصلی
        </Link>
      </Empty>
    </div>
  )
}
