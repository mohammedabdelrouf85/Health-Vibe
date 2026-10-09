# Health Vibe AI — Brand & Identity Guide

> **Status:** AUTHORITATIVE — applies to all text, metadata, messages, reports, UI strings, and documents.  
> **Last updated:** 2026-09-30  
> **Maintainer:** Product Owner / Lead Architect  

---

## 1. Final Product Name Decision

### ✅ Chosen Name: **Health Vibe AI**

| Variant | Status | When to Use |
|---|---|---|
| **Health Vibe AI** | ✅ CORRECT | All user-facing text, titles, metadata, emails, reports, marketing |
| Health Vibes AI | ❌ INCORRECT | Do not use — legacy spelling before 2026-09-30 |
| HealthVibe AI | ⚠️ URL / code only | Domain slugs (healthvibe.ai), file names, env variable prefixes |
| `HealthVibes` (JS) | ✅ Keep as-is | JavaScript global namespace only — changing breaks runtime |
| هيلث فايب | ✅ Arabic brand | Arabic user-facing text (singular, no trailing ز) |
| هيلث فايبز | ❌ Outdated Arabic | Do not use in new content |

### Rationale
- **"Health Vibe AI"** (singular) matches the registered domain `healthvibe.ai`, is cleaner in Arabic transliteration, and is professionally concise.
- The JavaScript namespace `global.HealthVibes` and Firebase project ID `health-vibes-a4b3b` are infrastructure identifiers — they must **not** be renamed to avoid breaking deployments and audit logs.

---

## 2. Full Legal / Formal Name

Use this only in contracts, LOIs, legal notices, and medical reports:

> **Health Vibe AI** — AI-Assisted Clinical Decision Support Platform

Arabic formal:

> **هيلث فايب للذكاء الاصطناعي** — منظومة دعم القرار السريري الذكي

---

## 3. Logo Usage Rules

### 3.1 Available Logo Assets (all in `app/`)

| File | Format | Background | Use Case |
|---|---|---|---|
| `logo-light.webp` / `.png` / `.jpg` | Full wordmark | Dark backgrounds | Dark theme header, dark-mode splash, pitch decks on dark slides |
| `logo-dark.webp` / `.png` / `.jpg` | Full wordmark | Light backgrounds | Light theme header, print, PDF reports, email headers |
| `logo-light-mark.webp` / `.png` | Icon/mark only | Dark backgrounds | Dark theme favicon fallback, nav brand mark in dark mode |
| `logo-dark-mark.webp` / `.png` | Icon/mark only | Light backgrounds | Light theme favicon, nav brand mark in light mode |
| `logo.webp` / `logo.jpg` | Full wordmark | Neutral/auto | Legacy — prefer -light / -dark variants |

### 3.2 Favicon Assignment

| Page | Current Favicon | Correct Assignment |
|---|---|---|
| `app/index.html` | `logo-light-mark.webp` (dark bg) | ✅ Correct for dark-default theme |
| `app/clinics.html` | `logo-dark-mark.png` | ✅ Acceptable; prefer `.webp` for performance |
| `index.html` (root redirect) | None | Should add `app/logo-dark-mark.webp` |

**Rule:** Always use the **mark** (icon-only) variant for favicons. Use the full wordmark only in page headers and loaders.

### 3.3 `data-logo` / `data-logo-mark` Attributes

The app uses `data-logo` and `data-logo-mark` HTML attributes to allow the theme engine to swap logos automatically on dark/light mode change. **Always preserve these attributes** on logo `<img>` tags.

### 3.4 Alt Text Standard

```html
<!-- Full wordmark -->
<img src="./logo-dark.webp" alt="Health Vibe AI" data-logo … />

<!-- Mark / icon only -->
<img src="./logo-dark-mark.webp" alt="Health Vibe AI logo" data-logo-mark … />
```

---

## 4. Color Palette

These are the authoritative design tokens. All new CSS must use `var(--token-name)` from `styles.css`.

| Token | Hex | CSS Variable | Use |
|---|---|---|---|
| Primary Teal | `#006D6F` | `--teal` | Main CTAs, active nav, brand marks |
| Deep Teal | `#03484A` | `--teal-dark` | Headers, important text, dark surfaces |
| Soft Cyan | `#E7F7F7` | `--teal-light` | Selected states, banners, calm backgrounds |
| Medical Blue | `#2B7DE9` | `--blue` | Information, appointments, links |
| Fresh Green | `#18A058` | `--green` | Low risk, approved, completed |
| Amber | `#D99A16` | `--amber` | Caution, pending follow-up |
| Clinical Red | `#D64545` | `--red` | High risk, rejected, urgent only |
| Ink | `#152528` | `--ink` | Primary body text |
| Muted | `#5E7275` | `--muted` | Secondary labels, timestamps |
| Surface | `#FFFFFF` | `--surface` | Cards, primary app surface |
| App Background | `#F4F8F8` | `--bg` | Screen / page background |
| Border | `#DCE8E8` | `--border` | Dividers, inputs, quiet boundaries |

### Usage Rules
- Teal is for trust and primary action — not decoration.
- Red is medical urgency or destructive action only. Never use it for generic warnings.
- Status colors must always pair with a text label or icon — never color alone.
- Patient screens: more whitespace, fewer dense metrics.
- Doctor / Admin screens: compact rows, queues, denser metrics are acceptable.

---

## 5. Typography

### Recommended Font Stack

| Language | Primary | Fallback |
|---|---|---|
| Arabic | Cairo | IBM Plex Sans Arabic, Noto Kufi Arabic, system-ui |
| English | Inter | IBM Plex Sans, Roboto, system-ui |

### Type Scale (Mobile-first)

| Role | Size | Weight |
|---|---|---|
| App / Product title | 26–30px | Medium (500) |
| Screen title / H1 | 22–24px | Medium (500) |
| Section title / H2 | 16–18px | Medium (500) |
| Body copy | 15–16px | Regular (400) |
| Labels / metadata | 12–14px | Regular (400) |
| Buttons | 15–16px | Medium (500) |
| Disclaimer / legal text | 12–13px | Regular (400) — must remain readable |

### Typography Rules
- Arabic is the primary language for patient flows. English is primary for doctor/admin flows.
- Use medium weight (500) for emphasis — avoid heavy bold in medical copy.
- Do not mix Arabic and English in the same label unless medically standard (e.g., SpO₂, BMI).
- Disclaimer text may be smaller but must meet WCAG AA contrast (4.5:1 minimum).

---

## 6. Tone of Voice

### 6.1 English Tone

| Attribute | Guidance | Example |
|---|---|---|
| Clear | Plain language; no jargon for patients | "Your doctor reviewed and approved your result" |
| Reassuring | Medical context is stressful — be warm | "Your assessment is on its way to a doctor" |
| Precise | For doctors/admins, be clinical and accurate | "High-confidence respiratory risk — review required" |
| Honest | Never overstate AI capability | "AI-assisted suggestion — doctor decision is final" |

**Avoid:** Overpromising, urgency theatre, wellness/lifestyle language, marketing superlatives in clinical context.

### 6.2 Arabic Tone (النبرة بالعربية)

| السمة | الإرشاد | مثال |
|---|---|---|
| واضح | لغة بسيطة للمريض | "نتيجتك وصلت للطبيب وجاهزة للمراجعة" |
| مطمئن | يقلل القلق دون إخفاء الحقيقة | "كل شيء على ما يرام، الطبيب يراجع نتيجتك الآن" |
| دقيق طبياً | للأطباء والإداريين | "حالة خطورة عالية — مطلوب مراجعة فورية" |
| صادق | لا مبالغة في قدرات الذكاء الاصطناعي | "اقتراح استرشادي — القرار النهائي للطبيب" |

**تجنّب:** المصطلحات الغربية الدخيلة بدون حاجة، الجمل الطويلة، نبرة التسويق في السياق الطبي.

### 6.3 Core Arabic UI Labels (Authoritative)

| English | Arabic | Notes |
|---|---|---|
| Health Vibe AI | هيلث فايب للذكاء الاصطناعي | Full formal Arabic |
| Health Vibe AI | هيلث فايب AI | Short-form in headings and navigation |
| Assessment | تقييم صحي | Patient-facing |
| Respiratory module | تقييم التنفس | |
| Pending doctor review | بانتظار مراجعة الطبيب | |
| Approved result | نتيجة معتمدة | |
| Follow-up required | يحتاج متابعة | |
| Low risk | مطمئن | Positive, reassuring tone |
| High risk | يحتاج رعاية عاجلة | Clinical urgency, not alarming |
| Medical disclaimer | تنبيه طبي | |
| Doctor-reviewed | معتمد من الطبيب | |
| AI suggestion | اقتراح استرشادي | Never use "تشخيص ذكاء اصطناعي" |

---

## 7. Report & Document Header Standard

All exported medical reports, PDFs, and formal documents must use this header:

### English Header

```
Health Vibe AI
AI-Assisted Clinical Decision Support

Patient:  [Full Name]          Report Ref:  [HV-XXXXX]
Doctor:   [Dr. Full Name]      Date:        [YYYY-MM-DD]
Clinic:   [Clinic Name]        Module:      Respiratory Assessment

MEDICAL DISCLAIMER: This report was generated with AI assistance and
reviewed by a licensed physician. The final clinical decision rests
with the reviewing doctor. This is not an autonomous AI diagnosis.
```

### Arabic Header (RTL)

```
هيلث فايب للذكاء الاصطناعي
منظومة دعم القرار السريري الذكي

المريض:   [الاسم الكامل]         رقم التقرير:  [HV-XXXXX]
الطبيب:   [د. الاسم الكامل]     التاريخ:       [YYYY-MM-DD]
العيادة:  [اسم العيادة]          الوحدة:        تقييم التنفس

تنبيه طبي: هذا التقرير صادر بمساعدة الذكاء الاصطناعي ومراجعة طبيب معتمد.
القرار السريري النهائي يعود للطبيب المراجع. هذا ليس تشخيصاً ذاتياً من الذكاء الاصطناعي.
```

---

## 8. Email Sender Identity

Once email is configured, all system emails must use:

| Field | Value |
|---|---|
| Display name | Health Vibe AI |
| From address | `notifications@healthvibe.ai` |
| Reply-to | `support@healthvibe.ai` |
| Subject prefix pattern | `[emoji] [Arabic action] - Health Vibe AI` |

### Example Subjects (standardized)

```
✅ تأكيد حجز موعدك الطبي - Health Vibe AI (2026-10-15 10:00)
🩺 نتيجة فحصك التنفسي جاهزة ومعتمدة - Health Vibe AI (#HV-00412)
🔐 رمز التحقق الخاص بك: 847291 - Health Vibe AI
⚠️ مطلوب استكمال بيانات لفحصك الطبي - Health Vibe AI (#HV-00381)
❌ إشعار بإلغاء موعدك الطبي - Health Vibe AI (2026-10-12)
🚨 تنبيه طبي عاجل: تصعيد الحالة السريرية - Health Vibe AI
```

### Email Footer Standard (all emails)

```html
<p>© Health Vibe AI — منظومة الرعاية الصحية الذكية</p>
```

---

## 9. Domain & Email Configuration Skeleton

> [!IMPORTANT]
> This section is a configuration skeleton only. Do NOT purchase, transfer, publish,
> or activate any domain, DNS record, or external service without explicit instruction
> from the product owner.

### 9.1 Target Domain Plan

| Environment | Target URL | Status |
|---|---|---|
| Production app | `https://app.healthvibe.ai` | Pending domain acquisition |
| Clinic portal | `https://healthvibe.ai/clinics` | Pending |
| Staging | `https://staging.healthvibe.ai` | Pending |
| Firebase fallback | `https://health-vibes-a4b3b.web.app` | Active now (no custom domain needed) |

### 9.2 DNS Records to Configure When Ready

```
; Production app → Firebase Hosting
app.healthvibe.ai.     IN A      [Firebase IP — get from Firebase Console]
app.healthvibe.ai.     IN AAAA   [IPv6 — get from Firebase Console]

; Root redirect to app
healthvibe.ai.         IN A      [Same Firebase IP]

; Email authentication (SPF / DKIM / DMARC)
healthvibe.ai.         IN TXT    "v=spf1 include:_spf.your-mail-provider.com ~all"
_dmarc.healthvibe.ai.  IN TXT    "v=DMARC1; p=quarantine; rua=mailto:dmarc@healthvibe.ai"
; DKIM: add the selector TXT record provided by your mail provider during setup
```

### 9.3 Backend Environment Variables (.env skeleton)

```env
# === Email / SMTP (fill when provider is selected) ===
SMTP_FROM=Health Vibe AI <notifications@healthvibe.ai>
SMTP_REPLY_TO=support@healthvibe.ai
SMTP_HOST=smtp.your-mail-provider.com
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=REPLACE_WITH_PROVIDER_API_KEY

# === Domain ===
PRODUCTION_DOMAIN=https://app.healthvibe.ai
STAGING_DOMAIN=https://staging.healthvibe.ai

# === reCAPTCHA (production site key — replace placeholder) ===
RECAPTCHA_SITE_KEY=REPLACE_WITH_PRODUCTION_KEY
RECAPTCHA_SECRET_KEY=REPLACE_WITH_SECRET_KEY
```

### 9.4 Firebase Hosting Custom Domain Steps (When Ready)

1. Go to Firebase Console → Hosting → Add custom domain
2. Enter `app.healthvibe.ai`
3. Follow the DNS verification flow (add TXT record first, then A/AAAA records)
4. Repeat for `staging.healthvibe.ai` on the staging project (`health-vibes-staging`)
5. Update `app/config.js` `PRODUCTION_HOSTS` array:
   ```js
   const PRODUCTION_HOSTS = ["healthvibe.ai", "app.healthvibe.ai", "health-vibes-a4b3b.web.app", ...];
   ```
6. Update `STAGING_HOSTS` similarly once staging domain is verified

---

## 10. Sales Deck & Demo Script Updates Required

### Files to Update

| File | Change Required |
|---|---|
| `PITCH_DECK_CONCISE.md` | Replace "Health Vibes AI" → "Health Vibe AI"; "هيلث فايبز" → "هيلث فايب" |
| `DEMO_SCRIPT_5_MINUTES.md` | Same replacements |
| `app/pitch.html` title tag | "Health Vibes AI" → "Health Vibe AI" |

### Specific Replacement Map

| Find | Replace with |
|---|---|
| `Health Vibes AI` | `Health Vibe AI` |
| `هيلث فايبز للذكاء الاصطناعي السريري` | `هيلث فايب للذكاء الاصطناعي السريري` |
| `هيلث فايبز للذكاء الاصطناعي` | `هيلث فايب للذكاء الاصطناعي` |
| `هيلث فايبز` (standalone) | `هيلث فايب` |

---

## 11. Code Symbol vs. User-Visible Text Boundary

| Scope | Name | Reason |
|---|---|---|
| UI text, labels, headings | **Health Vibe AI** | Brand identity |
| HTML `<title>` and `<meta>` | **Health Vibe AI** | SEO and identity |
| Email subjects, bodies, footers | **Health Vibe AI** | Brand identity |
| PDF / report headers | **Health Vibe AI** | Medical record integrity |
| Console log prefixes `[Health Vibe …]` | Standardize to Health Vibe | Internal tooling |
| `global.HealthVibes` JS namespace | **Keep unchanged** | Breaking change risk |
| `HealthVibesMetrics`, `HealthVibesDeidentification` | **Keep unchanged** | Internal code symbol |
| Firebase project IDs | **Keep unchanged** | Cannot be renamed without full migration |
| `health-vibes-*` IDs / `HEALTH_VIBE_*` env vars | **Keep unchanged** | Infrastructure |

---

## 12. File-by-File Standardization Status

| File | Naming Issues Found | Action |
|---|---|---|
| `app/index.html` `<title>` | "Health Vibes" | ✅ Updated → "Health Vibe AI" |
| `app/index.html` loader `<h1>` | "Health Vibes" | ✅ Updated → "Health Vibe AI" |
| `app/index.html` brand `<strong>` | "Health Vibes" | ✅ Updated → "Health Vibe AI" |
| `app/index.html` logo `alt` | "Health Vibes" | ✅ Updated → "Health Vibe AI" |
| `app/clinics.html` `<title>` | "Health Vibes AI …" | ✅ Updated → "Health Vibe AI …" |
| `app/clinics.html` meta description | "Health Vibes AI" | ✅ Updated → "Health Vibe AI" |
| `app/clinics.html` og:title | "Health Vibes AI" | ✅ Updated → "Health Vibe AI" |
| `app/pitch.html` `<title>` | "Health Vibes AI" | ✅ Updated → "Health Vibe AI" |
| `PITCH_DECK_CONCISE.md` | Throughout | ✅ Updated |
| `DEMO_SCRIPT_5_MINUTES.md` | Throughout | ✅ Updated |
| `backend/notification-service.js` email subjects/footers | "Health Vibes AI" | ✅ Updated → "Health Vibe AI" |
| `backend/whatsapp-bot.js` botName | "Health Vibes AI" | ✅ Updated → "Health Vibe AI" |
| `backend/server.js` log prefix | "Health Vibes AI" | ✅ Updated → "Health Vibe AI" |
| `design/healthvibe-ui-design-system.md` | "HealthVibe AI" title | ✅ Updated → "Health Vibe AI" |
| `global.HealthVibes` JS namespace | — | 🔒 Kept unchanged (code symbol) |
| Firebase project IDs | — | 🔒 Kept unchanged (infrastructure) |

---

*This guide supersedes all previous naming decisions. Any conflict between this guide and an older document is resolved in favor of this guide.*
