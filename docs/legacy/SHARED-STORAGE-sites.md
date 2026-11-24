> LEGACY: describes the old ChatGPT Sites build (Cloudflare Worker, D1, R2).
> Production now runs on Vercel + Neon. See CLAUDE.md and MIGRATION.txt.
> worker/, drizzle/, supabase/ and lib/supabase-store.mjs are kept only for
> backwards compatibility and tests; they are not used by production.

# UNIT FC shared storage

The public site reads the team's shared snapshot from `/api/shared`. Only the authenticated account matching the server-side `TEAM_ADMIN_EMAIL` environment variable can write. All writes also check Origin and an optimistic revision. Photos use immutable, content-addressed R2 paths. D1 records the active snapshot revision; prior snapshots remain in R2.

Build with `npm run build` before every Sites package/deploy. This is a Worker site, not a static-only site: preserve `.openai/hosting.json` D1 and R2 bindings, `worker/`, `drizzle/`, and the `shared-sync.js` bootstrap in `dist/index.html`. The generated entry is `dist/server/index.js`. Do not replace the manifest with static hosting or deploy only `dist/index.html`.

The initial owner import is done in the browser that contains the existing player profiles and photos, using **이 기기 데이터 공유하기**. Browser data is backed up before sharing. Subsequent owner edits are automatically saved. Visitors load the shared snapshot at page load and cannot save. Reload to see later edits. On revision conflict, unsent local data is retained and the UI offers loading the latest version after a backup.

The previous local-only release must not remain open for continued editing after this migration: refresh owner tabs after the first import. New edits in an old tab cannot upload themselves.

Run `npm test` for roster, rating, squad, and shared API checks. Hosted migrations are schema-only and immutable once applied. Secrets must not be put in source or client assets.
