# goprofile

ثبت فعالیت روزانه با جدول مشارکت شبیه GitHub (نمای ۲ بعدی و ۳ بعدی متحرک)، کارتابل‌ها به سبک جیرا، لاگ زمان دستی و تایمری، و گزارش هفتگی شبیه WorklogPro.

| بخش | مسیر | فناوری |
|---|---|---|
| API (بک‌اند) | `server/` | Node.js + TypeScript، PostgreSQL (pg) |
| وب‌سایت | `web/` | React + TypeScript + Next.js (خروجی استاتیک) |
| اپ ویندوز و اندروید | `app/` | Flutter |
| استقرار | `deploy/` | Docker Compose، nginx، Let's Encrypt |

## معماری

- **Clean Architecture + MVVM** در وب و اپ:
  - `domain/` موجودیت‌ها، قوانین (تقویم شمسی، تداوم، آمار ماهانه) و قرارداد ریپازیتوری‌ها
  - `data/` پیاده‌سازی ریپازیتوری‌ها روی API
  - `presentation/` ViewModelها (hookها در React، `ChangeNotifier` در Flutter) و Viewها
  - `core/` رمزنگاری و انتقال
- **سرور Node.js**: `secure` (رمزنگاری)، `db` (لود بالانس و migration)، `api` (احراز هویت Argon2id، کارتابل، تسک، لاگ زمان، آمار).

## امنیت

- **رمزنگاری کلید عمومی/خصوصی روی همه APIها**: هر درخواست با یک کلید موقت ECDH P‑256 در برابر کلید عمومی سرور مهر می‌شود؛ کلیدهای جداگانه درخواست و پاسخ با HKDF‑SHA256 ساخته و با AES‑256‑GCM رمز می‌شوند. متد، مسیر، توکن و بدنه همه داخل بسته رمزشده‌اند و شبکه فقط `POST /api/x` می‌بیند. جلوی replay با timestamp و شناسه یکتا گرفته شده است. کلید عمومی سرور در build وب pin می‌شود.
- این لایه روی TLS 1.2/1.3 در nginx قرار می‌گیرد (HSTS، CSP سخت، محدودیت نرخ، فقط دو مسیر API قابل دسترس).
- رمز عبور با Argon2id؛ توکن نشست تصادفی ۲۵۶ بیتی و فقط هش آن در دیتابیس؛ توکن در اپ داخل keystore سیستم‌عامل.
- همه کوئری‌ها پارامتری و محدود به کاربر جاری؛ دیتابیس فقط روی شبکه داخلی Docker.
- کانتینر API: read-only، بدون capability، کاربر غیر root (node).

## دیتابیس و لود بالانس

یک Primary و دو Replica با streaming replication. نوشتن روی Primary و خواندن‌های سنگین (آمار، گزارش) به صورت چرخشی بین Replicaهای سالم؛ Replica قطع یا عقب‌افتاده (بیش از ۳۰ ثانیه) خودکار کنار گذاشته می‌شود و در نبود Replica همه چیز روی Primary انجام می‌شود.

## توسعه محلی

```bash
# API (به PostgreSQL نیاز دارد)
cd server && npm install && DATABASE_URL=postgres://goprofile:goprofile@localhost:5432/goprofile npm run dev

# وب Next.js روی پورت 5173 (به API محلی localhost:8080 وصل می‌شود)
cd web && npm install && npm run dev

# تست‌ها
cd server && npm test
cd web && npm test && node scripts/smoke.ts http://localhost:8080
cd app && flutter test
```

## ثبت فعالیت، هشدارها و گزارش‌ها

- **دو روش ثبت زمان** در وب و اپ: تایمر (هر شروع یک لاگ تازه با زمان شروع جدید روی همان تسک می‌سازد و در لاگ‌های تسک دیده می‌شود) و ثبت دستی (تاریخ، ساعت شروع، مدت و توضیح).
- **تایمر**: «توقف» زمان را ثبت می‌کند و «تکمیل» علاوه بر ثبت، تسک را به اولین وضعیت «انجام‌شده» کارتابل می‌برد. در اپ صفحه تایمر تمام‌صفحه با حلقه پیشرفت دارد.
- **هشدار سررسید**: کارهای باز که سررسیدشان گذشته قرمز و کارهایی که امروز یا تا ۳ روز آینده سررسید می‌شوند نارنجی نمایش داده می‌شوند (کارتابل، داشبورد، نوار بالای صفحه، گزارش و PDF).
- **وضعیت کارها**: شمار کارهای باز، سررسیدگذشته، نزدیک سررسید و انجام‌شده هفته، و توزیع تسک‌ها روی وضعیت‌های هر کارتابل.
- **گزارش روزانه، هفتگی، ماهانه (شمسی) و سالانه**: کل زمان و مقایسه با دوره قبل (برای دوره جاری با مدت مشابه دوره قبل)، روزهای کاری، میانگین، تحقق هدف روزانه، نمودار ساعتی/روزانه/ماهانه، خط زمانی، توزیع کارتابل‌ها، تایمر در برابر دستی، روزهای هفته، کارکرد هر تسک، فهرست کارهای سررسیدگذشته، نزدیک سررسید، انجام‌شده و باقی‌مانده، ریز لاگ‌ها و جمع‌بندی متنی.
- **PDF**: در وب دکمه «خروجی PDF / چاپ» نسخه A4 مخصوص چاپ می‌سازد (در پنجره چاپ «Save as PDF» را بزنید)؛ در اپ PDF با فونت فارسی ساخته و برای چاپ یا اشتراک باز می‌شود.
- **بدون اینترنت**: اگر اینترنت یا سرور در دسترس نباشد، وب و اپ نوار قرمز خطا نشان می‌دهند و اپ با نشست ذخیره‌شده، به‌جای خروج از حساب، صفحه «اتصال برقرار نیست» و تلاش خودکار دارد.

## اپ Flutter

```bash
cd app
flutter run -d windows --dart-define=API_URL=https://goprofile.ir
flutter build apk --release --obfuscate --split-debug-info=build/symbols --dart-define=API_URL=https://goprofile.ir --dart-define=SERVER_KEY=<pub>
flutter build windows --release --obfuscate --split-debug-info=build/symbols --dart-define=API_URL=https://goprofile.ir --dart-define=SERVER_KEY=<pub>
```

مقدار `<pub>` را `deploy.sh` بعد از هر استقرار چاپ می‌کند (اختیاری؛ با آن اپ هر کلید دیگری را رد می‌کند).

### پیش‌نیازهای ساخت APK روی ویندوز

| ابزار | توضیح |
|---|---|
| Flutter SDK (stable) | نصب‌شده در `C:\src\flutter`؛ مسیر `C:\src\flutter\bin` را به PATH اضافه کنید |
| JDK 17 | Microsoft OpenJDK 17 نصب است |
| Android Studio یا Command-line Tools | از developer.android.com؛ سپس با SDK Manager: `platform-tools`، `platforms;android-36`، `build-tools;36.0.0`، و NDK پیشنهادی Flutter |
| مجوزها | `flutter doctor --android-licenses` |
| Developer Mode ویندوز | Settings → System → For developers (برای پلاگین‌ها لازم است) |
| بررسی | `flutter doctor` باید برای Android تیک سبز بدهد |

### کلید امضا (برای آپدیت بدون حذف برنامه)

اندروید فقط APKی را روی نسخه نصب‌شده نصب می‌کند که با **همان کلید** امضا شده باشد. یک بار کلید بسازید و از فایل و رمزهایش پشتیبان امن نگه دارید:

```bash
keytool -genkey -v -keystore app/android/app/upload-keystore.jks -keyalg RSA -keysize 4096 -validity 10000 -alias goprofile
```

سپس `app/android/key.properties.example` را به `key.properties` کپی و پر کنید (هر دو فایل در git نیستند). برای ساخت در GitHub Actions همین مقادیر را در Secrets بگذارید: `ANDROID_KEYSTORE_BASE64` (خروجی base64 فایل jks)، `ANDROID_KEYSTORE_PASSWORD`، `ANDROID_KEY_ALIAS`، `ANDROID_KEY_PASSWORD`.

### انتشار نسخه جدید اپ

عدد بعد از `+` در `version` فایل `pubspec.yaml` را در هر انتشار بالا ببرید. سپس:

```bash
scp app/build/app/outputs/flutter-apk/app-release.apk deploy@goprofile.ir:/tmp/goprofile.apk
ssh deploy@goprofile.ir 'bash /opt/goprofile/deploy/scripts/publish-app.sh 0.3.0 3 /tmp/goprofile.apk'
```

اپ‌های نصب‌شده با خواندن `https://goprofile.ir/app/version.json` پیام «نسخه جدید آماده است» نشان می‌دهند و فایل از `https://goprofile.ir/app/goprofile.apk` دریافت می‌شود. همه داده‌ها روی سرور است، پس نصب نسخه جدید چیزی را پاک نمی‌کند.

## استقرار روی سرور

### نصب اولیه (یک دستور)

1. رکورد A دامنه‌های `goprofile.ir` و `www.goprofile.ir` را به IP سرور بدهید.
2. یک Deploy Key فقط‌خواندنی در GitHub بسازید و کلید خصوصی‌اش را در `/root/.ssh/id_ed25519` سرور بگذارید.
3. `deploy/scripts/server-setup.sh` را با scp روی سرور کپی کنید و به عنوان root اجرا کنید:
   ```bash
   bash server-setup.sh you@example.com 0.3.0
   ```
   این اسکریپت Docker، nginx، فایروال، fail2ban، گواهی SSL رایگان Let's Encrypt (با تمدید خودکار)، پشتیبان‌گیری روزانه دیتابیس و خود سرویس را نصب و اجرا می‌کند. اجرای دوباره‌اش امن است و داده، رمزها و گواهی را نگه می‌دارد.
4. بعد از اطمینان از ورود با SSH Key: `bash /opt/goprofile/deploy/scripts/harden-ssh.sh` (ورود با رمز و root بسته می‌شود).

### به‌روزرسانی

```bash
su - deploy -c 'bash /opt/goprofile/deploy/scripts/deploy.sh 0.3.0'
```

قبل از هر به‌روزرسانی یک پشتیبان کامل از دیتابیس گرفته می‌شود، دیتابیس در Volumeهای Docker می‌ماند و migrationها فقط اضافه می‌کنند. اگر سرویس جدید سالم بالا نیاید، اسکریپت متوقف می‌شود و دستور بازگشت به نسخه قبل را چاپ می‌کند.

### پشتیبان و بازگردانی

- پشتیبان‌ها در `/var/backups/goprofile` (هر شب ساعت ۳:۳۰ و قبل از هر استقرار، ۳۰ نسخه آخر نگه داشته می‌شود).
- پشتیبان دستی: `bash /opt/goprofile/deploy/scripts/backup.sh manual`
- بازگردانی: `bash /opt/goprofile/deploy/scripts/restore.sh /var/backups/goprofile/<file>.dump`

## نسخه‌ها و برنچ‌ها

- `main`: نسخه‌های منتشرشده؛ `develop`: توسعه.
- تگ‌ها به شکل SemVer بدون پیشوند: `0.1.0`، `1.2.15`.
- کامیت‌ها کوتاه و ساده، بدون پیشوند.
