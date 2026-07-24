# Pixel Eye Blog Backend

TypeScript Express API foundation for the Pixel Eye Blog CMS.

## Prerequisites

- Node.js 22+
- npm 10+
- MySQL 8+ for live startup and migration checks
- Cloudflare R2 credentials for media upload/delete verification
- SMTP credentials for mail transporter verification

## Installation and environment

1. Run `npm ci` or `npm install`.
2. Copy `.env.example` to `.env`.
3. Configure a development-only MySQL user and database:

```sql
CREATE DATABASE pixel_eye_blog_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Do not use production credentials for local migration or rollback testing. The API authenticates MySQL before listening and exits with a controlled error when it is unavailable.
The Sequelize CLI uses `DB_TEST_NAME` for test operations so it cannot silently reuse the development database name.

Never commit `.env`. Real database, JWT, R2, SMTP and Super Admin values belong only in local/deployment secrets.

## Required environment variables

Database:

```text
DB_HOST
DB_PORT
DB_NAME
DB_USER
DB_PASSWORD # may be empty only for local MySQL setups that intentionally have no password
```

Authentication:

```text
JWT_ACCESS_SECRET
JWT_ACCESS_EXPIRES_IN
JWT_ISSUER
JWT_AUDIENCE
REFRESH_TOKEN_EXPIRES_IN_DAYS
AUTH_MAX_FAILED_ATTEMPTS
AUTH_LOCK_MINUTES
AUTH_SESSION_HISTORY_RETENTION_DAYS
AUTH_MAX_ACTIVE_SESSIONS_PER_USER
```

Initial Super Admin seeder:

```text
INITIAL_SUPER_ADMIN_NAME
INITIAL_SUPER_ADMIN_EMAIL
INITIAL_SUPER_ADMIN_PASSWORD
```

Cloudflare R2:

```text
CLOUDFLARE_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET_NAME
R2_REGION
R2_ENDPOINT
R2_PUBLIC_BASE_URL
R2_OBJECT_PREFIX
R2_MAX_FILE_SIZE_MB
R2_ALLOWED_IMAGE_TYPES
```

SMTP:

```text
SMTP_HOST
SMTP_PORT
SMTP_SECURE
SMTP_USER
SMTP_PASSWORD
MAIL_FROM_NAME
MAIL_FROM_EMAIL
```

`EMAIL_SERVICE`, `EMAIL_USER`, and `EMAIL_PASS` are accepted as local aliases for `SMTP_HOST`, `SMTP_USER`, and `SMTP_PASSWORD`, but `SMTP_*` is the preferred deployment contract.

## Development commands

```text
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
npm start
npm audit
```

## Database commands

```text
npm run db:drop
npm run db:create
npm run db:migrate
npm run db:migrate:undo
npm run db:seed
npm run db:reset
npm run auth:sessions:cleanup
```

Phase 2 authentication database setup adds `admin_users`, `admin_sessions`, and `audit_logs` through Sequelize migrations. The media foundation stores Cloudflare R2 object keys and variant metadata in `media_assets`. Roll back with `npm run db:migrate:undo` before re-running migrations during local checks.

The initial Super Admin seeder reads the `INITIAL_SUPER_ADMIN_*` variables and never logs the password. It hashes the password with the same reusable scrypt-compatible format verified by the authentication service.

Every schema change must use a migration with reversible `up` and `down` methods. Never use `sequelize.sync({ force: true })` or `sequelize.sync({ alter: true })` in production.

## Authentication endpoints

Canonical admin auth endpoints:

```text
POST /api/v1/auth/login
POST /api/v1/auth/refresh
POST /api/v1/auth/logout
GET /api/v1/auth/me
```

Backward-compatible endpoints are also mounted under `/api/v1/admin/auth`.

Login returns a short-lived access token in JSON. The refresh token is set as a restricted HttpOnly cookie and is not exposed to frontend JavaScript. Refresh tokens are stored only as SHA-256 hashes in `admin_sessions` and are rotated on refresh. Logout revokes the current session idempotently and clears the refresh cookie. `/auth/me` returns only safe admin profile fields and never returns `password_hash` or security counters.

## Cloudflare R2 media storage

Architecture:

```text
Admin frontend -> Express backend -> multer memory upload -> Sharp -> Cloudflare R2 -> MySQL metadata
```

The backend uses Cloudflare R2 object storage for reusable media assets. Do not expose R2 credentials to the frontend. Uploads flow through the authenticated backend API, are processed in memory with Sharp, uploaded as WebP objects, and only object keys/metadata are stored in MySQL.

`R2_ENDPOINT` is for private S3-compatible API operations. Do not use it as an image display URL.
`R2_PUBLIC_BASE_URL` is the public bucket URL or custom domain used to display images. Public URLs are built as `R2_PUBLIC_BASE_URL/object-key` with object-key URL encoding.

Authenticated media endpoints:

```text
POST /api/v1/media/assets
DELETE /api/v1/media/assets/:id
```

Both require `Authorization: Bearer <admin access token>`. The backend derives `uploaded_by`, role and permissions from the authenticated database user. It never trusts `uploaded_by` or role values from the request body.

Supported image inputs are JPEG, PNG, WebP and AVIF. SVG is rejected. Files are held in memory, validated by MIME type, magic bytes and Sharp decoding, then emitted as `original`, `thumbnail`, `card`, `content`, `hero` and `avatar` WebP objects under keys like:

```text
pixel-eye-blog/media/<uuid>/original.webp
pixel-eye-blog/media/<uuid>/thumbnail.webp
```

## Blog CRUD foundation

The admin Blog foundation uses Sequelize migrations only. It adds `blogs` for lifecycle metadata and `blog_versions` for immutable draft/published snapshots. Image binaries are not stored in MySQL; blog featured images reference existing `media_assets` rows.

Migration commands:

```text
npm run db:migrate
npm run db:migrate:undo
npm run db:migrate
```

Authenticated admin blog endpoints:

```text
POST /api/v1/blogs
GET /api/v1/blogs
GET /api/v1/blogs/trash
GET /api/v1/blogs/:id
PATCH /api/v1/blogs/:id
POST /api/v1/blogs/:id/publish
POST /api/v1/blogs/:id/unpublish
DELETE /api/v1/blogs/:id
POST /api/v1/blogs/:id/restore
```

Draft edits update the current draft version. Publishing creates a new immutable published snapshot and keeps the draft/published version history. Updating a published blog changes only the draft until `POST /api/v1/blogs/:id/publish` is called again. Normal delete moves the blog to Trash and preserves content, versions and media references for restore.

Role behavior:

- `super_admin` and `editor`: create, list, edit, publish, unpublish, trash and restore.
- `author`: create and edit/trash their own non-published blogs; publishing and restore remain backend-restricted.
- `viewer`: read-only where backend policy permits.

## Health endpoints

- `GET /api/v1/health/live` checks only Node.js process liveness.
- `GET /api/v1/health/ready` checks MySQL readiness and returns 503 when unavailable.
- `GET /api/v1/health` is the safe technical readiness summary used by the admin.

Public health checks never contact Cloudflare R2 or SMTP.

## Integration verification

Run:

```text
npm run verify:integrations
```

The command checks, without exposing secrets:

- Database configuration and connection
- R2 configuration and bucket access using a safe `HeadBucket`
- SMTP configuration and `transporter.verify()` without sending an email
- JWT configuration validity

It exits non-zero when a configured integration fails or required configuration is incomplete.

## Security

- Never commit `.env` or real credentials.
- R2 keys, SMTP passwords, database passwords, JWT secrets, refresh tokens and Super Admin passwords are backend-only secrets.
- No R2 credential or token is required by, or returned to, the frontend.
- Access tokens contain only safe claims: admin id, role, session id and token type.
- Refresh token rotation creates a new `admin_sessions` row, revokes the previous row, links `replaced_by_session_id`, preserves `session_family_id`, and stores `parent_session_id` for the rotation chain. Keep this history for reuse detection. Run `npm run auth:sessions:cleanup` to delete only expired or revoked rows older than `AUTH_SESSION_HISTORY_RETENTION_DAYS`. `AUTH_MAX_ACTIVE_SESSIONS_PER_USER` limits active session families per admin without counting rotated rows as separate devices.
- CORS origins are configured through `CORS_ORIGINS`.
- Production startup requires explicit database and deployment URL values.
- Logs redact known password, token, authorization, cookie, SMTP password and R2 credential fields.

## Troubleshooting

- **Startup reports `ECONNREFUSED`:** start MySQL and verify `DB_HOST` and `DB_PORT`.
- **Startup reports access denied:** verify the restricted MySQL username, password, and grants.
- **Migration command cannot connect:** confirm `.env` exists and targets the development database.
- **CORS request is rejected:** add the exact admin origin to `CORS_ORIGINS`; do not use `*`.
- **R2 verification is incomplete:** provide the R2 variables in backend `.env`, then rerun `npm run verify:integrations`.
- **R2 verification fails:** confirm bucket name, endpoint, account ID and bucket-scoped Object Read & Write credentials.
- **SMTP verification fails:** confirm host/service, port, secure flag, username, app password and from email.

## Media trash lifecycle

Normal media deletion moves the asset to Trash; it does not delete Cloudflare R2 objects. The row stays in `media_assets` with `status=trashed`, `trashed_at`, `trashed_by`, and `purge_after` populated. The retention window is controlled by `MEDIA_TRASH_RETENTION_DAYS`.

Lifecycle statuses:

```text
active -> trashed -> deleting -> deleted
active -> trashed -> deleting -> delete_failed -> deleting -> deleted
trashed -> active
```

Trash APIs:

```text
GET /api/v1/media/assets/trash
POST /api/v1/media/assets/:id/restore
DELETE /api/v1/media/assets/:id/permanent
```

`GET /api/v1/media/assets` returns active media only by default. Trash listing returns `trashed` and `delete_failed` rows with retention metadata such as `trashed_at`, `trashed_by`, `purge_after`, `days_remaining`, and `delete_failure`.

Permanent delete is the R2-destructive action. It is restricted to `super_admin` and `editor`, marks the row `deleting`, deletes the original and generated R2 variant objects, then marks the database row `deleted` with `deleted_at` and `deleted_by`. If R2 deletion fails, the row becomes `delete_failed` and can be retried from Trash. The database row is retained for audit/history; image binaries are never stored in MySQL.

Automatic purge is manual/scheduler-driven only; it is not run on API startup:

```text
npm run media:trash:purge
```

The purge command deletes only expired trashed media where `purge_after <= now`, processes at most `MEDIA_TRASH_PURGE_BATCH_SIZE` rows per run, and logs counts only. Recommended production scheduling: run it from a trusted scheduler/cron worker at a low-traffic interval, for example hourly or daily depending on media volume.

## Advanced Blog Editor

Blog content is stored as TipTap JSON (`content_json`), which is the source of truth. The root must be `doc`. Allowed nodes are paragraph, text, headings 2–4, bullet/ordered lists, list items, blockquote, horizontal rule, and hard break. Allowed marks are bold, italic, and HTTP/HTTPS links.

The API ignores client-supplied `content_html`, validates the JSON tree, generates HTML with the official TipTap server renderer, and sanitizes the generated output before storing both JSON and HTML. Script, iframe, raw HTML, custom CSS, unsupported nodes/marks, and unsafe link protocols are rejected.

`GET /api/v1/blogs/:id/publish-checklist` returns authoritative readiness items for title, slug, excerpt, content, featured media, featured-media alt text, SEO title/description, and canonical URL. Publish and Publish Updates use the same checklist contract; SEO and canonical omissions are warnings, while editorial and media omissions block publishing.

## Blog system templates

The Blog CMS supports exactly two backend-controlled templates:

- `template_1` (version 1): Classic Single-Column Article (`single_column`)
- `template_2` (version 1): Article with Sidebar (`article_sidebar`)

`GET /api/v1/blogs/templates` is an authenticated, read-only registry endpoint. There are no template create, update, or delete endpoints.

Every `blog_versions` row stores `template_key`, `template_version`, and `template_config_json`. Migration `20260723000100-add-blog-version-templates.cjs` safely backfills existing rows to the fixed Template 1 snapshot before making these fields non-null. Its down migration removes only these fields and their index.

Blog create and update requests may send only `template_key`. Creation defaults to `template_1`; unsupported keys and client-supplied template version/configuration fields are rejected. The backend resolves the current fixed registry snapshot. Draft template changes do not mutate a Published version. Publish and Publish Updates copy the exact Draft template snapshot into a new immutable Published `BlogVersion`; prior Published versions remain unchanged. The publish-readiness checklist includes a required `template` item, and Draft template changes create `BLOG_TEMPLATE_CHANGED` audit events.

## Templates Library

The protected, read-only Templates Library is available to `super_admin`, `editor`, `author`, and `viewer` roles:

- `GET /api/v1/templates` returns the two fixed system templates with active usage counts.
- `GET /api/v1/templates/:templateKey` returns safe public details, fixed regions, supported behavior, and usage for `template_1` or `template_2`.
- `GET /api/v1/blogs/templates` remains available for Blog Create/Edit compatibility and uses the same authoritative registry.

System templates cannot be created, edited, or deleted through the API. There are no Templates POST, PATCH, or DELETE routes. Usage counts include only non-trashed Blogs: `draft_count` uses the current Draft version, `published_count` uses the current Published version, and `total_blog_count` is the distinct union of either current version, preventing double-counting when both use the same template. Responses expose descriptive regions and supported behavior, never raw executable configuration.

## Template 1 structured blocks

Template 1 version 2 stores Blog-authored structured sections in `blog_versions.blocks_json`. The field is separate from TipTap `content_json`, generated `content_html`, and system-owned `template_config_json`.

Schema version 1 contains fixed keys for hero metadata, Key Takeaways, Image Comparison, Numbered List, Expert Quote, Medical CTA, FAQ, feedback controls, share controls, and the mandatory medical disclaimer. Unknown keys, unsupported schema versions, raw HTML, executable configuration, and unsafe URLs are rejected.

`POST /api/v1/blogs` and `PATCH /api/v1/blogs/:id` accept optional `blocks_json`. Missing or legacy NULL documents normalize to the controlled default. Detail responses return normalized blocks for Draft and Published versions without rewriting rows during GET. Publish validates enabled sections and active public media references, then copies the exact normalized document into a new immutable Published BlogVersion.

Comparison images and expert avatars store MediaAsset IDs only. Draft save and Publish reject missing, trashed, deleted, or non-public assets. Permanent media deletion is blocked while a current Draft or Published BlogVersion references the asset.

Validation errors retain the standard API error response and include structured paths such as `blocks_json.blocks.faq.items.0.question`. Template 1 v1 remains legacy, Template 1 v2 consumes blocks, and Template 2 remains unchanged.
