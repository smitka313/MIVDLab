# ClassPulse

**Better classroom management. Stronger student support. Less paperwork.**

ClassPulse is a classroom management web app for high school teachers (grades 9–12). It brings seating charts, quick behavior and engagement observations, attendance, intervention plans, parent/guardian communication, groups and projects, reminders and reports into one place, with a professional interface and no gamified discipline or public rankings.

> **Privacy notice.** ClassPulse is designed for FERPA-conscious use, but it is **not automatically FERPA-compliant**. Before using it with real student records, get district review, approved data-privacy agreements, and confirmation that your deployment meets the requirements that apply to you. Demo mode must only ever hold fictional data.

---

## Contents

- [Quick start (demo mode)](#quick-start-demo-mode)
- [Install as an app](#install-as-an-app)
- [Branding](#branding)
- [Running with Supabase (real accounts)](#running-with-supabase-real-accounts)
- [Deploying to Vercel](#deploying-to-vercel)
- [Tests](#tests)
- [What's implemented](#whats-implemented)
- [Architecture](#architecture)
- [Security and privacy design](#security-and-privacy-design)
- [Extending ClassPulse](#extending-classpulse)
- [Known limitations and what remains](#known-limitations-and-what-remains)

---

## Quick start (demo mode)

Requirements: Node.js 20.9+ (22 recommended).

```bash
cd classpulse        # the app folder (repository root in the ClassPulse repo)
npm install
npm run dev
# open http://localhost:3000
```

With no Supabase variables set, ClassPulse runs in **demo mode**:

- A fictional classroom is generated on first visit: one demo teacher, six class periods (Biology, AP Biology, Intro to Engineering Design, STEM Research Lab, Principles of Engineering), about 150 fictional students, seating layouts, four weeks of attendance and observations, intervention plans, groups, a project, contacts and reminders.
- Data is saved in **this browser's localStorage only**. It is not secure storage, it isn't shared between devices, and a banner on every page says so.
- **Settings → Data & privacy → Reset demo classroom** restores the demo. **Delete all classroom data** gives you an empty workspace for trying setup from scratch.

The demo adapter mirrors the database's foreign keys, cascades, unique constraints and audit logging, so the app behaves the same way it does against Supabase.

## Install as an app

ClassPulse is a Progressive Web App. Teachers can install it from the browser, with no app store, download or administrator rights needed:

- **Chromebook / Windows / Mac (Chrome or Edge):** use the install icon in the address bar, **Install ClassPulse app** in the sidebar, or **Settings → Install the app**.
- **Android:** Chrome menu → *Install app* / *Add to Home screen*.
- **iPhone / iPad:** Safari → Share → *Add to Home Screen*.

The installed app opens in its own window with the ClassPulse icon, and has shortcuts to Classroom, Attendance and Students. It's served from `src/app/manifest.ts`, `public/sw.js` and the icons in `public/`.

The service worker only works in production builds (`npm run build && npm start`, or a deployment), and needs HTTPS (or `localhost`). It caches **only the app itself** (code, page shells, icons), never student records:

- Supabase traffic goes to another domain and is never intercepted.
- Pages render records in the browser after sign-in, so the cached HTML contains no records.
- Sign-out clears the caches.

Offline, the app shell opens. In demo mode the browser's demo data still works offline. With Supabase, loading and saving show a clear "couldn't reach the server — nothing was saved" error, and pages you haven't opened before show an offline page.

## Branding

The palette comes from the ClassPulse logo:

| Token | Color | Use |
|---|---|---|
| Navy | `#001A40` | Wordmark "Class", primary buttons, text |
| Deep navy → royal | `#00133D` → `#015095` | Sidebar, app-icon gradient |
| Teal | `#01B5C2` | Wordmark "Pulse", pulse line, highlight buttons (with navy text) |
| Teal ink | `#007A85` | Teal as text on white (passes WCAG AA; the logo teal alone doesn't) |
| Light teal / slate | `#7CD1D9` / `#7991AF` | Accents, dividers |

Logo files are in `public/brand/`:

- `classpulse-mark.svg` / `-reverse.svg` — the mark on light / dark backgrounds
- `classpulse-lockup.svg` / `-reverse.svg` — the mark with wordmark and tagline
- `classpulse-app-icon.svg` / `classpulse-maskable.svg` — app icons
- `original-*.png` — crops of the supplied logo artwork (lockup, app icon, badge), for print and marketing

The SVGs are vector redraws of the supplied artwork, so they stay crisp at any size. The PNG icons in `public/` were rendered from them. The colors are defined once as CSS variables in `src/app/globals.css`, with light and dark (navy-and-glow) themes.

## Running with Supabase (real accounts)

1. **Create a Supabase project** at <https://supabase.com>.
2. **Apply the migrations**, in order:
   - `supabase/migrations/20261110000100_core_schema.sql` — tables, constraints, triggers, audit log
   - `supabase/migrations/20261110000200_security.sql` — row-level security, grants, account/data deletion and retention functions
   - `supabase/migrations/20261110000300_storage.sql` — private `student-photos` bucket and its policies

   With the Supabase CLI: `supabase link --project-ref <ref>` then `supabase db push`. Or paste each file into the SQL editor.
3. **Configure auth** (Authentication → URL configuration): set the Site URL to your app URL and add `<your-url>/auth/callback` to the redirect URLs. Email/password and email-link sign-in are both supported. For district SSO see [Extending](#extending-classpulse).
4. **Set environment variables**: copy `.env.example` to `.env.local` and fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
5. `npm run dev`, then create an account at `/signup`.

New accounts start empty, apart from editable starter configuration: behavior categories and quick-log buttons, attendance statuses, an intervention strategy library, team roles and message templates. To explore with sample data, use **Settings → Data & privacy → Load demo data…**. This replaces everything in the account with fictional records, after a typed confirmation.

> I didn't have access to a live Supabase project while building this. The schema, RLS policies and database functions were tested against PostgreSQL 16 with a small auth shim (`supabase/tests/auth_shim.sql`; see [Tests](#tests)). The browser client (`src/lib/data/supabase-adapter.ts`) is straightforward supabase-js, but it hasn't been run against a hosted project. Test sign-up, sign-in, data entry and photo upload on a staging project before relying on it.

## Deploying to Vercel

1. Import the repository in Vercel. If the app sits in a subfolder (as in the MIVDLab repository), set **Root Directory** to that folder. In the standalone ClassPulse repository it's the repository root.
2. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in Project → Settings → Environment Variables. If you leave them out, the deployment runs in demo mode.
3. Deploy. Add the production URL's `/auth/callback` to Supabase's redirect URLs.

No server secrets are needed. The service-role key is never used by the app and must not be added to the frontend.

## Tests

```bash
npm run typecheck   # TypeScript
npm run lint        # ESLint (Next.js + React Compiler rules)
npm test            # unit + data-layer tests (Vitest)          — 64 tests
npm run test:db     # PostgreSQL RLS/authorization tests         — 14 tests
npm run build && npm run test:e2e   # Playwright end-to-end, desktop + phone — 22 tests
```

`test:db` needs a PostgreSQL 15+ superuser connection in `TEST_DATABASE_URL`, for example `postgres://postgres:postgres@localhost:5432/postgres`. It creates a temporary database, applies the auth shim and all migrations, then checks behavior as the real `authenticated` and `anon` roles. Without the variable the suite is skipped.

`test:e2e` starts `next start` on port 3200 in demo mode. Every test gets a fresh browser profile and therefore a fresh demo classroom. Playwright 1.63 is pinned; run `npx playwright install chromium` if you don't already have a matching browser.

How the acceptance criteria are covered:

| # | Requirement | Where |
|---|---|---|
| 1 | Create a class and import a roster | e2e `classroom.spec.ts` |
| 2 | Create and save a seating chart (click-assign and drag-and-drop) | e2e `classroom.spec.ts` |
| 3 | Select a student and record an observation | e2e `observations.spec.ts` |
| 4 | Observations persist after refresh | e2e `observations.spec.ts`; unit `data-layer.test.ts` |
| 5 | Observations appear in the student profile | e2e `observations.spec.ts` |
| 6 | Attendance saved to the correct date and class | e2e `workflows.spec.ts`; unit upsert test |
| 7 | Create, update and complete an intervention | e2e `workflows.spec.ts` |
| 8 | Communication records created and reviewed | e2e `workflows.spec.ts` (log + draft) |
| 9 | Groups created and modified | e2e `workflows.spec.ts` |
| 10 | Reports reflect stored data | unit `reports.test.ts`; e2e report vs. observation history |
| 11 | Unauthorized users can't access another teacher's records | db `rls.test.ts` |
| 12 | Malformed CSV handled safely | unit `csv.test.ts`, `import-logic.test.ts`; e2e |
| 13 | Works on desktop and mobile | e2e `mobile.spec.ts` (Pixel 7: no horizontal overflow on every main page, bottom nav, quick log, seating chart) |
| 14 | Exports produce valid files | unit CSV round-trip; e2e CSV and JSON downloads |
| 15 | Destructive actions require confirmation | e2e `workflows.spec.ts` (typed confirmation) |
| — | Installable web app; offline shell; no cross-origin caching | e2e `pwa.spec.ts` |

## What's implemented

| Area | Highlights |
|---|---|
| **Dashboard** | Today's schedule with attendance status per class, daily overview, action items (reminders, intervention reviews, contact follow-ups, flagged observations), recent activity, quick actions, customizable widgets, first-run onboarding checklist |
| **Classroom** | Class periods (course, period, term, room, meeting days and times, color, description), archive/restore, typed-confirmation delete. Per class: **Live Classroom** (seating chart or roster view, one-click observations, attendance mode, current instructional activity, today's tallies on each seat), **Roster**, **Seating layouts** |
| **Seating charts** | Templates (rows, pods, tables, lab stations, blank). Drag-and-drop furniture and students, with swapping. Teacher desk, door, lab bench, table, board and window elements. Resize, rename, duplicate, default layout, print. Click-to-assign and arrow-key nudging as keyboard-accessible alternatives to dragging |
| **Students** | Search, filters, sorting, pagination, bulk enroll/archive, CSV export, optional photo (private storage). **CSV import** with column mapping, preview, validation, duplicate detection (by student ID, then exact name; in-file duplicates) and a per-row error report |
| **Student profile** | Overview, timeline, attendance, behavior & engagement (weekly chart, most frequent behaviors, by activity), interventions, communication, private notes. Filters by date, class, category and event type |
| **Attendance** | Present/absent/tardy/excused plus custom statuses. Take attendance from the roster or the seating chart, mark all unmarked present, notes, any date, class history grid, by-student and by-class summaries, trend chart, CSV. Clearly labelled as *not* the official school record |
| **Behavior & engagement** | Observation history with filters (dates, class, student, type, category, activity, follow-up, text). Detailed entry form. Corrections are saved with full audit history. Configurable categories and quick-log buttons. No numerical behavior scores |
| **Interventions** | Plans (target, success criteria, baseline helper, strategy, dates, notes). Status workflow: planned → active → under review → completed or discontinued. Progress reviews (helpful / needs modification / discontinue / too early). Before/after chart. Editable strategy library. Never diagnoses or recommends discipline |
| **Groups & projects** | Random balanced or manual groups, team roles, lab stations, saved and duplicable configurations, leave out absent students, print. Group observations. Projects with milestones, tasks, group assignment and deadlines |
| **Communication** | Contact log (email, phone, conference, virtual, student conversation, other) with follow-ups. Message drafting from editable templates and **teacher-selected, factual observations**. A review checkbox is required before copying or opening an email draft. Nothing is ever sent automatically |
| **Reports & analytics** | 8 reports: student summary, class behavior, attendance, positive recognition (including students with no recognition yet), intervention progress, conference preparation, administrative documentation (private notes only when chosen), group participation. Print / Save as PDF and CSV. Charts: positive/redirection trends, attendance trend, observations by activity, behavior distribution, intervention progress. Every report states its data limitations, such as gaps in documentation |
| **Tasks** | In-app reminders (parent contact, conference, intervention review, documentation, general) with priority and due dates, plus items derived from records |
| **Settings** | Profile, theme (light/dark/system), date and time formats, school years and terms, categories and quick-log buttons, attendance statuses, default seating charts, strategy library, team roles, notifications, data export (JSON), retention policy, demo reset, delete all data, delete account, audit log viewer |

Throughout: loading, empty, error and success states. Toasts appear only after the backend confirms a save. Undo for observations, attendance, notes, reminders, clearing seats and more. Confirmation dialogs (typed for irreversible deletes). Keyboard shortcut **L** for Quick Log. Skip link, focus states, ARIA labelling. Color is always paired with text or icons.

## Architecture

```
classpulse/
├── supabase/
│   ├── migrations/            # schema, RLS/security, storage (source of truth)
│   └── tests/auth_shim.sql    # minimal Supabase auth stand-in for plain-Postgres tests
├── src/
│   ├── app/
│   │   ├── (app)/             # authenticated app: dashboard, classroom, students, …
│   │   ├── (auth)/            # login, signup
│   │   └── auth/callback/     # email-link / confirmation code exchange
│   ├── proxy.ts               # session refresh + sign-in redirect + security headers (Next 16 "proxy")
│   ├── components/
│   │   ├── ui/                # shadcn/ui-style primitives on Radix (button, dialog, tabs, …)
│   │   ├── app/app-shell.tsx  # sidebar, top bar, period switcher, mobile nav
│   │   └── providers/         # DataProvider (boot, adapters, hooks), theme/toasts
│   ├── features/              # feature modules (seating, observations, students, groups, …)
│   └── lib/
│       ├── data/              # DataAdapter interface, Supabase + Demo adapters, Store cache
│       ├── types.ts           # row types mirroring the SQL schema
│       ├── reports.ts, stats.ts, timeline.ts, csv.ts, messages.ts   # pure, unit-tested logic
│       ├── demo/seed.ts       # fictional demo classroom generator
│       └── integrations/sis.ts  # SIS connector interface (no connector implemented)
└── tests/{unit,db,e2e}
```

**Data flow.** Pages are client components that read tables through `useRows(table)` and write through the `Store`. The Store caches each table and updates the cache **only after the adapter confirms** the write, so a failed request never shows as saved. Two adapters implement the same interface:

- `SupabaseAdapter` — supabase-js with the signed-in user's session. Authorization happens in Postgres through RLS.
- `DemoAdapter` — localStorage. It mirrors the SQL schema's FKs, cascades and unique constraints (from `schema-meta.ts`, which a test checks against the migrations) and writes an audit log.

**Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, Radix primitives in the shadcn/ui style, Lucide icons, Supabase (Postgres, Auth, Storage), Recharts, React Hook Form + Zod, Papaparse, Sonner, Vitest, Playwright.

Why client-side rendering: classroom data is private and per-teacher, so there's nothing useful to pre-render or cache on the server. Fetching straight from Postgres with the user's JWT keeps RLS as the single authorization layer. Each table is loaded once per session and cached, which keeps Live Classroom instant. Supabase reads are paged in 1,000-row chunks. This suits a teacher's own records (thousands to tens of thousands of rows a year). See the limitations section for scaling further.

## Security and privacy design

- **Row-level security on every table.** Teachers can read, insert, update and delete only rows where `teacher_id = auth.uid()`. `FORCE ROW LEVEL SECURITY` is on. Anonymous users have no table privileges.
- **Composite foreign keys** `(parent_id, teacher_id)` make it impossible at the database level to attach a record to another teacher's class, student, plan or group, even though FK checks bypass RLS. This is tested.
- **Explicit sharing only.** `data_access_grants` lets a teacher give a colleague *read-only* access to their classroom records. **Teacher notes are never shared** by a grant. Grants can be revoked.
- **Audit log.** Triggers record every insert, update and delete, with old and new values, for students, enrollments, notes, attendance, observations, intervention plans and progress, and communications. Users can read only their own log and cannot insert, change or delete entries. Record "History" buttons show corrections.
- **Least privilege.** Users can't change their own `role`. Security-definer functions pin `search_path`. Trigger functions can't be called directly.
- **Account and data lifecycle.** `delete_my_classroom_data()`, `delete_my_account()` (cascades everything) and `apply_retention_policy()` (configurable 1–5 years). Full JSON export.
- **Student photos** live in a **private** bucket under `<teacher-id>/…`, are resized to 256 px in the browser before upload, and are shown only through short-lived signed URLs.
- **Minimal data.** No demographic, disability or medical fields. Private notes are kept separate from shareable records.
- **Input handling.** Zod validation in forms plus database `CHECK` constraints and length limits. React escaping. CSV exports neutralize spreadsheet formula injection. CSV import enforces size and row limits and rejects binary and control characters. Post-login redirects only go to same-site paths. `mailto:` links accept only plain email addresses.
- **Headers.** `X-Frame-Options: DENY`, `nosniff`, a strict referrer policy and a restrictive permissions policy are set in `proxy.ts`. `poweredByHeader` is off.
- **No third-party AI.** No student data is sent to AI services. Message drafting is template-based and done locally.
- **Secrets.** Only `NEXT_PUBLIC_SUPABASE_URL` and the anon key reach the browser. The service-role key is never referenced.

## Extending ClassPulse

- **New table:** add it to a migration (with `teacher_id`, `unique (id, teacher_id)`, composite FKs and the RLS loop list in `security.sql`), then to `types.ts` (`Tables`, `TABLE_ORDER`) and `schema-meta.ts`. The schema-sync unit test fails if the SQL and the metadata disagree.
- **District SSO:** enable SAML/OIDC in Supabase Auth (Google Workspace, Microsoft Entra, Clever via OIDC) and add a provider button in `src/features/auth-form.tsx` using `signInWithSSO` / `signInWithOAuth`. No schema change is needed.
- **SIS integration:** implement `SisConnector` in `src/lib/integrations/sis.ts` as a **server-side** route with its own credentials (for example OneRoster 1.2), and register it in `SIS_CONNECTORS`. The UI states that no SIS is connected until one actually is.
- **Multi-teacher / admin:** `schools`, `profiles.role`, `data_access_grants` and the `can_read()` policy helper are the extension points. Add new grant scopes or a school-admin branch to `can_read()`.
- **AI-assisted drafting or summaries:** only after district approval. Add a server route that requires an explicit per-use opt-in, de-identifies input, and calls an approved provider. Keep the existing "teacher reviews before sending" step.
- **Notifications:** reminders are in-app only. Email or push could be added with a scheduled Supabase Edge Function that reads `reminders`.

## Known limitations and what remains

- **Live Supabase not exercised here** (see above). Test on a staging project before using with real students.
- **Scale:** each table is loaded whole per session (paged 1,000 rows per request). For many years of data or very large rosters, move heavy reports to SQL views or RPCs and add server-side pagination to the observation history.
- **PDF export** uses the browser's print dialog (*Save as PDF*) with print styles. There is no server-generated PDF.
- **Offline use:** a failed request shows an error and nothing is queued. There's no offline mode.
- **Demo mode** stores data in localStorage (about 5 MB). It's for evaluation, not for real records.
- **Not implemented** (designed for, see Extending): SIS sync, district SSO, email or push notifications, administrator dashboards, multi-teacher collaboration UI (the grants table exists but has no screen yet), student goal-setting portal, AI features.
- Accessibility has been considered throughout (labels, roles, focus, keyboard alternatives to drag-and-drop, reduced motion) but has not been audited with a screen reader.
