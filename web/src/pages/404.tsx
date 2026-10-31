import Link from 'next/link'
import { Empty } from '@/presentation/components/ui'

export default function NotFound() {
  return (
    <div className="page page-narrow">
      <Empty title="این صفحه پیدا نشد">
        <Link href="/" className="btn">
          بازگشت به داشبورد
        </Link>
      </Empty>
    </div>
  )
}
