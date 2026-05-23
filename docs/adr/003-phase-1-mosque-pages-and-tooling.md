# ADR 003: Phase 1 — Public Mosque Pages, Standing Schedules, and Operator Tooling

**Date:** 2026-05-23
**Status:** Accepted

## Context

Phase 1 of Qivam needed to ship four things at once:

1. A public mosque page Google can index (`qivam.com/m/{slug}`).
2. A correct shape for "prayer times this masjid currently observes."
3. A way for the operator (one person, no admin users yet) to onboard 10–20 mosques manually.
4. Privacy: zero personal admin contact in the public API.

The pre-existing schema had a date-keyed `prayer_times` table (one row per mosque per day), a single `jummah_adhan`/`jummah_iqamah` pair on the mosque row, public-readable `mosques.email`/`phone`, and no public mosque page at all. Onboarding required raw curl against the super-admin API. There was no concept of "this mosque is verified but I don't want it shown right now."

This ADR records the set of decisions made during the Phase 1 push that are non-obvious and should not be re-litigated.

## Decisions

### 1. Phase 1 has no mosque admin user

No JWT auth, no admin registration, no ownership middleware, no self-serve claiming. All writes go through `superAdminAuth` and are performed by a single operator using the `tools/` app. The `admins` table exists for Phase 2 and is referenced only by the optional approve/reject email path — its absence is non-fatal (see decision 8).

Collecting admin contact in the onboarding form was rejected: there is no DB home for it in Phase 1, and capturing data with no destination creates a false sense of storage. Phase 2 introduces the `admins` table as load-bearing and adds the field then.

### 2. Standing prayer schedule, not date-keyed times

A new `prayer_schedules` table replaces date-keyed `prayer_times` as the source for Phase 1:

```ts
prayer_schedules
  id, mosque_id (unique FK), fajr/dhuhr/asr/maghrib/isha adhan+iqamah pairs,
  jummah_times jsonb default '[]'::jsonb, created_at, updated_at
```

Exactly one row per mosque. To change times (Ramadan, clock changes) the operator overwrites it in place. There is no `effective_from`, no date column, and no "today vs. default" fallback chain. The `prayer_times` table remains in the schema (already migrated) but no new code path reads or writes it. Scheduling-ahead is Phase 2.

The dual-table fallback pattern (`getTodayPrayerTimes` → fall back to `prayerSchedules`) was explicitly rejected — only one path would ever be hit, and it would be a source of confusion in code review.

### 3. Multi-slot jumu'ah via JSONB, not extra columns

Many UK/Ireland mosques run 2–3 jumu'ah slots. Adding `jummah2_adhan` / `jummah3_adhan` columns scales poorly. `jummah_times jsonb` stores `Array<{ adhan: string; iqamah: string | null }>` with a default of `sql\`'[]'::jsonb\`` (not a JS array literal — the generated migration was verified to use `'[]'::jsonb`).

### 4. Public contact privacy: omit when null

`mosques.email` and `mosques.phone` remain nullable in the schema, default `null`, and are **never** auto-populated from operator contact details. The repository's `mapMosqueRow` omits these fields from the response object when null (rather than emitting `"email": null`). The public `mosqueResponse` Zod schema treats them as `.optional()`. A `grep -i "super-admin" landing/.env` returning no matches is part of the verification checklist.

### 5. Public detail folds prayer schedule in

`GET /v1/mosques/:id` (which accepts both UUID and slug) LEFT JOINs `prayer_schedules` and returns the schedule inline:

```ts
prayerSchedule: PrayerSchedule | null
```

This keeps the landing page loader to a single fetch with only the public API key — no schedule subrequest, no super-admin key on the landing deployment. The list endpoint `GET /v1/mosques` does **not** join schedules (expensive per row); only the detail does.

### 6. `is_published` is orthogonal to `verification_status`

A new boolean `mosques.is_published` (default `true`, NOT NULL) gates public reads independently of verification:

```sql
WHERE verification_status = 'verified' AND is_published = true
```

Applied to `listMosques`, `getMosqueByIdOrSlug`, and `nearbyMosques`. A new endpoint `PATCH /v1/super/mosques/:id/visibility` flips the flag without touching `verification_status`. Tools shows a `Hide` / `Show` button only for verified mosques.

Reasoning: a verified mosque whose operator disengages should not be downgraded to `rejected` (information loss — they were vetted). Soft-hide is an operational toggle, not a moderation decision. Alternatives considered: a fourth `verification_status` enum value (rejected — conflates moderation and publication), reusing `claim_status` (rejected — tangles ownership and visibility), soft-delete with `deleted_at` (rejected — implies finality).

A super-admin getter `GET /v1/super/mosques/:id` was added as the consequence: with the public getter no longer returning hidden or pending rows, the tools edit form needs a path that ignores both filters.

### 7. Landing is React Router v7 framework mode, server-rendered

The landing migrated from Vite SPA to React Router v7 framework mode running on Cloudflare Pages. The mosque page is fully SSR — `curl -A Googlebot` returns prayer times in the HTML source without JS, and the QR SVG is inlined via `dangerouslySetInnerHTML`, visible in view-source.

Layout structure uses RR7's `layout()` route helper:

```ts
export default [
  layout("routes/shell.tsx", [
    index("routes/home.tsx"),
    route("privacy", "routes/privacy.tsx"),
    route("*", "routes/not-found.tsx"),
  ]),
  route("m/:slug", "routes/m.$slug.tsx"),  // standalone, no Nav/Footer
];
```

The mosque page is intentionally outside the shell — it should read like a utility page (Apple/Google Maps detail), not a marketing site.

### 8. Env var naming protects the API key

The landing reads `API_KEY` (no `VITE_` prefix) so Vite cannot inline it into the client bundle. `VITE_API_URL` is safe to expose. `SUPER_ADMIN_KEY` is never set in the landing deployment under any name — it belongs only to `tools/`. This is enforced by convention and verified by `grep -i super-admin landing/.env` returning no matches.

### 9. Embed-mode widget via `?embed=1`

Third-party sites can embed `qivam.com/m/{slug}?embed=1` in an iframe. The loader detects the search param server-side and the page renders only the prayer times table, optional jumu'ah block, and a "Powered by Qivam" footer — no mosque name header, no map link, no facilities. The same SSR HTML, conditionally minimal.

The embed snippet itself is not on the public mosque page — the operator sends it to mosques privately on request. This keeps the public page focused on worshippers (the primary audience) rather than developers.

### 10. Approve/reject side-effect isolation

`PATCH /super/mosques/:id/approve` and `reject` were observed returning 500 after the DB commit when `getMosqueWithAdminEmail` threw (e.g. for mosques with no linked admin). The route was hardened: update verification status first, then attempt the email in an independent `try/catch` block. The route always returns 200 if the DB update succeeded. Email failures are logged but never propagated.

This matches Phase 1 reality — mosques onboarded by the operator have no admin row, so `getMosqueWithAdminEmail` returns undefined or errors, and that must not unwind a successful approval.

## Build order followed

1. `prayer_schedules` table + `jummah_times` JSONB + nullable contact → `drizzle-kit generate` + migrate
2. Repository + use-case: `upsertPrayerSchedule`, `getPrayerSchedule`, `PrayerSchedule` model
3. Public API: fold schedule into `GET /v1/mosques/:id`; super-admin: `POST /super/mosques`, `PUT /super/mosques/:id/prayer-schedule`, `GET /super/mosques` with status filter
4. Landing: RR7 framework mode + Cloudflare adapter
5. Landing: `/m/:slug` SSR page (server-side QR via `qrcode`, light theme, embed mode)
6. Tools app: list with tabs, slide-over detail panel, onboarding form (Leaflet + Nominatim), edit-mode prefill via super-admin GET
7. `is_published` flag + tools Hide/Show toggle
8. Removed legacy `/admin/` directory

## Consequences

**Good:**
- Public mosque page exists and is Google-indexable from day one (SSR, inline QR, semantic meta tags).
- The "current times" model matches reality (one standing schedule, overwrite to change) — no fictitious per-date rows.
- Multi-slot jumu'ah works without column bloat.
- Operator onboarding is a form, not curl, with map confirmation and address autocomplete.
- The verification axis stays clean: a `rejected` mosque really was rejected, not "hidden because the admin went quiet."
- Approving a mosque is a single deliberate operator action with no path that 500s after the DB commit.
- Embed widget is real (used by mosque websites) without leaking the embed-code UX onto the worshipper-facing page.

**Trade-offs:**
- Two boolean dimensions for public visibility (`verified` AND `published`) instead of one enum. Tools UI must communicate the combined state; mitigated by showing the `hidden` chip only alongside `verified`.
- `@aws-sdk/client-sesv2` lives in `core` (for `ses.adapter.ts`) — `core`'s dependency graph touches AWS. Justified by adapters being an explicit layer boundary (per ADR 002).
- The `prayer_times` table is dead code in the schema. Kept rather than dropped to avoid an irreversible migration before Phase 2 decides whether per-date overrides go there or in a sibling table.

## Phase 2 deferrals (explicit non-goals)

The following were intentionally **not** built in Phase 1. Building them would have multiplied scope without serving the 10–20 mosque goal:

- Mosque admin user accounts, JWT auth, registration flow, password reset
- Self-serve mosque claiming (`claim_status` exists in the schema but no claim UX uses it)
- Per-date prayer time overrides (Ramadan, clock-change scheduling-ahead)
- Public search/listing UI on the landing (premature with < 20 mosques; the API endpoint exists)
- Admin contact collection in the onboarding form
- "Today vs. default" prayer time fallback chain
- Date-range visibility scheduling (e.g. "hide between these dates")

Each of these is a Phase 2 entry point with its own ADR when implemented.
