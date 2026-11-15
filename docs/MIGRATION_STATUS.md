# Migration status

## Stage 0 — source acquisition: complete
- Downloaded the exact official backend and frontend source archives for the pinned commits.
- Both ZIP files passed integrity checks; extracted file counts: backend 859, frontend 397.
- SHA-256 checksums and provenance are retained under `upload/`.
- Backend LICENSE is AGPL-3.0. The frontend archive has no root LICENSE/NOTICE file and GitHub reports no declared license; no license is inferred.

## Stage 1 — runtime foundation: complete
- Nuxt 4.4.8 / Tailwind CSS 3.4.19 project shell.
- Prisma 6 schema and SQLite migrations.
- Runtime adapter selects Cloudflare D1 when bound, otherwise lazy-loads Node `node:sqlite`.
- Isolated Node SQLite migrations, Node/D1 adapter contract tests, typecheck and Node build pass.

## Stage 2 — authentication and permissions: complete for the implemented contract
- Alist-compatible SHA-256 static password hashing and salted password hashes.
- HS256 JWTs with `username`, `pwd_ts`, issue/not-before/expiry claims; password timestamp invalidation and token revocation.
- Login throttling, TOTP verification/QR generation, device keys, session TTL and max-device policy.
- Guest/admin role seeding, permission-scope bitmasks, registration gate, current-user/profile/logout/public-settings APIs.
- Admin user and role CRUD foundations.
- CI runs a real Node server and verifies admin login, JWT, `/api/me`, admin user/role APIs, public settings, registration, logout and token revocation.
- Remaining auth parity: LDAP, SSO, WebAuthn/passkeys, SSH keys, and full session-management edge cases.

## Stage 3 — storage and filesystem: implementation in progress
- Added Storage metadata migration and admin storage CRUD for the Local driver.
- Added an upstream-derived catalog of 99 driver names. Only Local is implemented; the other 98 are explicitly marked pending, not exposed as working drivers.
- Added Node-only Local filesystem operations: list/get/dirs/mkdir/rename/move/copy/remove/batch rename/regex rename/search, raw stream upload, multipart upload, and range-aware download.
- Local storage is confined to its configured absolute root; path traversal and symlink escapes are rejected. Local filesystem access is intentionally unavailable on Cloudflare Edge.
- Still pending: remote storage drivers, archive/decompression, offline download/task queue, signed media links, WebDAV/S3/FTP/SFTP protocol compatibility, and full upstream FS contract parity.

## Remaining stages
- Stage 4: Nuxt UI, admin storage/driver forms, file browser, preview/media and internationalization.
- Stage 5: remote driver ports, Edge/D1 validation, browser interaction and broader integration tests.
- Stage 6: final feature matrix, security review, clean release ZIP and v1.0.0 package.

All tests use isolated temporary storage and databases. No production service, database, credential or deployment is used.
