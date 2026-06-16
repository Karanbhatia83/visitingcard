# Card Scanner

Scan a business card with your phone camera. An AI vision model reads the
details, you review and edit, and the contact is saved both in the app and to
your Google Contacts. Built mobile-first with large, senior-friendly UI.

---

## Features

- **Camera-first scanning** — capture a card, the AI extracts name, company,
  designation, mobile/office numbers, emails, website, LinkedIn, address, notes.
- **Review & edit** before saving, with multi-value phone/email fields.
- **Google Contacts sync** — create, update, and delete via the People API.
- **Duplicate detection** — checks your local store *and* Google Contacts by
  email and phone, then lets you update the existing record or save as new.
- **Contact management** — search, sort, filter, edit, delete, view card image.
- **Export** — CSV, Excel (`.xlsx`), and vCard (`.vcf`), all contacts or one.
- **PWA** — installable, offline shell, app-shell caching.
- **Security** — Google OAuth, per-user authorization on every query, request
  validation (Zod), per-user scan rate limiting, audit logging.

## Tech stack

Next.js 14 (App Router) · React · TypeScript · Tailwind CSS · shadcn/ui-style
components · Prisma + PostgreSQL · Auth.js v5 (Google OAuth) · S3-compatible
storage (Cloudflare R2 or AWS S3) · AI vision (Anthropic / OpenAI / Gemini) ·
Netlify hosting.

## Architecture at a glance

**Scan flow:** the browser downscales and lightly enhances the photo on-device,
then `POST`s it to `/api/scan`. The server stores the image in object storage,
sends it to the configured vision model, and saves a `Scan` row with the
structured JSON. You're routed to `/review/[scanId]` to confirm.

**OCR approach (important):** there is no separate Tesseract/OpenCV pipeline.
A multimodal vision model performs OCR **and** field extraction in one step from
the photo — this is more accurate on real-world cards (logos, multi-column
layouts, stylised type) than classic OCR + regex. The strict extraction schema
and prompt live in `src/lib/ai/prompt.ts`; the provider abstraction is in
`src/lib/ai/`.

**Auth:** Auth.js v5 with a JWT session and the Prisma adapter. The Google scope
includes `.../auth/contacts` with offline access so a refresh token is stored;
`src/lib/google/tokens.ts` refreshes the access token on demand. Edge middleware
(`src/middleware.ts`) protects `/scan`, `/review`, `/contacts`, `/settings`.

**Storage:** images live under `cards/{userId}/...`. They're served through
`/api/image` (ownership-checked) which redirects to a signed URL, or directly
from `S3_PUBLIC_BASE_URL` if your bucket is public.

## Screens

Landing · Sign in · Scanner · Processing (inline) · Review · Duplicate
resolution (dialog) · Contact list · Contact detail · Edit contact · Settings.

---

## Setup

### Prerequisites

- Node.js 20+
- A PostgreSQL database (Neon or Supabase recommended for serverless pooling)
- A Google Cloud project (OAuth credentials + People API)
- An S3-compatible bucket (Cloudflare R2 or AWS S3)
- An API key for one AI provider (Anthropic, OpenAI, or Gemini)

### 1. Install

```bash
npm install
cp .env.example .env   # then fill in the values below
```

### 2. Database

Set both URLs in `.env`:

- `DATABASE_URL` — pooled connection (PgBouncer/Neon pooler) used at runtime.
- `DIRECT_URL` — direct connection used only for migrations.

Create the schema with either:

```bash
npm run db:push        # fastest: pushes the schema, no migration history
# or
npm run db:migrate     # applies prisma/migrations/0001_init
```

### 3. Google OAuth + People API

1. Google Cloud Console → **APIs & Services → Library** → enable **People API**.
2. **Credentials → Create credentials → OAuth client ID → Web application**.
3. Authorised redirect URIs:
   - `http://localhost:3000/api/auth/callback/google` (local)
   - `https://YOUR-SITE.netlify.app/api/auth/callback/google` (production)
4. On the OAuth consent screen add the scope
   `https://www.googleapis.com/auth/contacts` (plus the default
   `userinfo.email` / `userinfo.profile`). While the app is in "Testing", add
   your Google account as a test user.
5. Put the client ID/secret in `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

### 4. AI provider

Set `AI_PROVIDER` to `anthropic`, `openai`, or `gemini`, then provide the
matching key and model. **Verify the model name against what your account can
access** — defaults are placeholders:

```
AI_PROVIDER="anthropic"
ANTHROPIC_API_KEY="..."   ANTHROPIC_MODEL="claude-sonnet-4-6"
OPENAI_API_KEY="..."      OPENAI_MODEL="gpt-4o"
GEMINI_API_KEY="..."      GEMINI_MODEL="gemini-1.5-pro"
```

### 5. Object storage (R2 or S3)

```
S3_ENDPOINT="https://<accountid>.r2.cloudflarestorage.com"  # R2
S3_REGION="auto"            # "auto" for R2; e.g. "us-east-1" for AWS
S3_BUCKET="business-cards"
S3_ACCESS_KEY_ID="..."
S3_SECRET_ACCESS_KEY="..."
S3_PUBLIC_BASE_URL=""        # set if the bucket is public; else leave blank
```

For AWS S3, use the standard regional endpoint and region. CORS isn't required
because uploads happen server-side.

### 6. Auth secret

```bash
openssl rand -base64 32      # put the result in AUTH_SECRET
```

Set `NEXTAUTH_URL` to your local or production base URL (no trailing slash).

### 7. Run locally

```bash
npm run dev
# http://localhost:3000
```

---

## Deploy to Netlify

This is a server-rendered Next.js app, so deploy from Git (drag-and-drop of a
static folder will not work).

1. Push this project to a Git repository and **Add a new site → Import** it in
   Netlify. The included `netlify.toml` sets the build command
   (`npm run build`) and the official `@netlify/plugin-nextjs`.
2. In **Site settings → Environment variables**, add every variable from
   `.env.example` (set `NEXTAUTH_URL` to your `https://...netlify.app` URL).
3. Add the production redirect URI to your Google OAuth client (step 3 above).
4. Ensure the database schema is applied (`npm run db:push` against your prod
   database, or `db:migrate`).
5. Deploy. `prisma generate` runs automatically on build.

---

## Environment variables

| Variable | Purpose |
| --- | --- |
| `NEXTAUTH_URL` | Public base URL (no trailing slash) |
| `AUTH_SECRET` | Session encryption secret (`openssl rand -base64 32`) |
| `DATABASE_URL` | Pooled Postgres URL (runtime) |
| `DIRECT_URL` | Direct Postgres URL (migrations) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth credentials |
| `AI_PROVIDER` | `anthropic` \| `openai` \| `gemini` |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` | Anthropic key + vision model |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | OpenAI key + vision model |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | Gemini key + vision model |
| `S3_ENDPOINT` / `S3_REGION` / `S3_BUCKET` | Object storage location |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | Storage credentials |
| `S3_PUBLIC_BASE_URL` | Optional public image base; blank = signed URLs |
| `RATE_LIMIT_SCANS_PER_HOUR` | Per-user scan cap (default 60) |

## Scripts

| Script | Action |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | `prisma generate` + `next build` |
| `npm start` | Start the production server |
| `npm run db:push` | Push schema to the database |
| `npm run db:migrate` | Apply migrations (`migrate deploy`) |
| `npm run db:studio` | Open Prisma Studio |

## Project structure

```
src/
  app/
    page.tsx                  Landing
    (auth)/signin/            Sign in
    scan/                     Camera + scan
    review/[scanId]/          Review extracted details
    contacts/                 List (search/sort/filter/export)
    contacts/[id]/            Detail
    contacts/[id]/edit/       Edit
    settings/                 Google sync, export, install, sign out
    api/                      scan, contacts, duplicates, export, image,
                              settings, google/resync, auth
  components/                 UI + feature components (camera, forms, nav)
  lib/
    ai/                       Provider abstraction + extraction prompt
    google/                   People API + token refresh
    contact-service.ts        Save/update/delete/sync/resync + dedup
    storage.ts export.ts validation.ts rate-limit.ts audit.ts
prisma/schema.prisma          Data model
prisma/migrations/            SQL migration
public/                       manifest, service worker, offline page, icons
```

---

## Known limitations & honest notes

- **Run a build locally first.** The codebase is complete and internally
  consistent, but a full `next build` was not executed in the authoring
  environment. Run `npm install && npm run build` once and fix any minor
  environment-specific issues before going live.
- **Auto-crop / perspective correction is light.** The client downscales and
  enhances the image; it does not do four-corner perspective warp. A drop-in
  hook is documented in `src/lib/image.ts` (e.g. add `jscanify`/`opencv.js`
  there without touching the scan flow). Modern vision models tolerate mild
  skew well.
- **Push notifications are scaffolding.** `public/sw.js` includes working
  `push`/`notificationclick` handlers, but delivery requires server-side Web
  Push (VAPID keys) and a stored `PushSubscription`, which are not wired up.
- **Background sync is a placeholder.** The `sync` handler resolves cleanly;
  replaying offline writes needs an IndexedDB queue you can add later.
- **Confirm AI model names and SDK versions.** Model identifiers are
  configurable via env vars — set ones your account can use. Dependency
  versions use caret ranges; `npm install` resolves the latest compatible.
- **Image serving.** With a private bucket, images are streamed via signed URLs
  through `/api/image`. Set `S3_PUBLIC_BASE_URL` only if your bucket is public.
