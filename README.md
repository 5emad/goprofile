# goprofile

ثبت فعالیت روزانه با جدول مشارکت شبیه GitHub (نمای ۲ بعدی و ۳ بعدی)، کارتابل‌ها به سبک جیرا، لاگ زمان دستی و تایمری، و گزارش هفتگی شبیه WorklogPro.

| بخش | مسیر | فناوری |
|---|---|---|
| API | `server/` | Go، PostgreSQL (pgx) |
| وب‌سایت | `web/` | React + TypeScript + Vite |
| اپ ویندوز و اندروید | `app/` | Flutter |
| استقرار | `deploy/` | Docker Compose، nginx، Let's Encrypt |

## معماری

- **Clean Architecture + MVVM** در وب و اپ:
  - `domain/` موجودیت‌ها، قوانین (تقویم شمسی، تداوم، آمار ماهانه) و قرارداد ریپازیتوری‌ها
  - `data/` پیاده‌سازی ریپازیتوری‌ها روی API
  - `presentation/` ViewModelها (hookها در React، `ChangeNotifier` در Flutter) و Viewها
  - `core/` رمزنگاری و انتقال
- **سرور**: `secure` (رمزنگاری)، `db` (لود بالانس و migration)، `auth` (Argon2id و توکن)، `api` (هندلرها).

## امنیت

- **رمزنگاری کلید عمومی/خصوصی روی همه APIها**: هر درخواست با یک کلید موقت ECDH P‑256 در برابر کلید عمومی سرور مهر می‌شود؛ کلیدهای جداگانه درخواست و پاسخ با HKDF‑SHA256 ساخته و با AES‑256‑GCM رمز می‌شوند. متد، مسیر، توکن و بدنه همه داخل بسته رمزشده‌اند و شبکه فقط `POST /api/x` می‌بیند. جلوی replay با timestamp و شناسه یکتا گرفته شده است. کلید عمومی سرور در build وب pin می‌شود.
- این لایه روی TLS 1.2/1.3 در nginx قرار می‌گیرد (HSTS، CSP سخت، محدودیت نرخ، فقط دو مسیر API قابل دسترس).
- رمز عبور با Argon2id؛ توکن نشست تصادفی ۲۵۶ بیتی و فقط هش آن در دیتابیس؛ توکن در اپ داخل keystore سیستم‌عامل.
- همه کوئری‌ها پارامتری و محدود به کاربر جاری؛ دیتابیس فقط روی شبکه داخلی Docker.
- کانتینر API: read-only، بدون capability، کاربر nonroot.

## دیتابیس و لود بالانس

یک Primary و دو Replica با streaming replication. نوشتن روی Primary و خواندن‌های سنگین (آمار، گزارش) به صورت چرخشی بین Replicaهای سالم؛ Replica قطع یا عقب‌افتاده (بیش از ۳۰ ثانیه) خودکار کنار گذاشته می‌شود و در نبود Replica همه چیز روی Primary انجام می‌شود.

## توسعه محلی

```bash
# API (به PostgreSQL نیاز دارد)
cd server && DATABASE_URL=postgres://goprofile:goprofile@localhost:5432/goprofile?sslmode=disable go run ./cmd/goprofile

# وب (درخواست‌های /api به localhost:8080 پروکسی می‌شوند)
cd web && npm install && npm run dev

# تست‌ها
cd server && go test ./...
cd web && npm test && node scripts/smoke.ts http://localhost:8080
cd app && flutter test
```

## اپ Flutter

```bash
cd app
flutter run -d windows --dart-define=API_URL=https://goprofile.ir
flutter build windows --release --dart-define=API_URL=https://goprofile.ir --dart-define=SERVER_KEY=<pub>
flutter build apk --release --dart-define=API_URL=https://goprofile.ir --dart-define=SERVER_KEY=<pub>
```

ساخت ویندوز به Visual Studio (Desktop development with C++) و ساخت اندروید به Android SDK نیاز دارد. روی ویندوز Developer Mode باید فعال باشد. مقدار `<pub>` را `deploy.sh` بعد از هر استقرار چاپ می‌کند.

## استقرار روی سرور

1. رکورد DNS دامنه‌های `goprofile.ir` و `www.goprofile.ir` را به IP سرور بدهید.
2. یک Deploy Key فقط‌خواندنی در GitHub بسازید و کلید خصوصی‌اش را در `/root/.ssh/id_ed25519` سرور بگذارید.
3. روی سرور به عنوان root:
   ```bash
   curl -fsSLo server-setup.sh https://raw.githubusercontent.com/5emad/goprofile/main/deploy/scripts/server-setup.sh  # یا با scp کپی کنید
   bash server-setup.sh you@example.com
   ```
4. استقرار یک نسخه:
   ```bash
   su - deploy -c 'bash /opt/goprofile/deploy/scripts/deploy.sh 0.1.0'
   ```
5. بعد از اطمینان از ورود با SSH Key: `bash /opt/goprofile/deploy/scripts/harden-ssh.sh`

## نسخه‌ها و برنچ‌ها

- `main`: نسخه‌های منتشرشده؛ `develop`: توسعه.
- تگ‌ها به شکل SemVer بدون پیشوند: `0.1.0`، `1.2.15`.
- کامیت‌ها کوتاه و ساده، بدون پیشوند.

## فونت

فونت IRANYekanX تجاری است (فایل مجوز کنار فونت‌ها). ریپو را عمومی نکنید مگر مجوز انتشار داشته باشید.
