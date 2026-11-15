# Migration status

## Stage 0 — source acquisition: complete
- Downloaded exact official source archives for the pinned backend and frontend commits.
- Both ZIP files passed `unzip -t`; extracted file counts: backend 859, frontend 397.
- SHA-256 checksums and provenance are retained under `upload/`.
- The frontend source archive has no root LICENSE/NOTICE file and GitHub reports no declared license; do not infer a license. Backend LICENSE is AGPL-3.0.

## Stage 1 — runtime foundation: implementation started
- Nuxt 4.4.8 / Tailwind CSS 3.4.19 project shell.
- Initial Prisma 6 SQLite schema and SQL migration.
- Runtime adapter chooses Cloudflare D1 binding when present; otherwise lazy-loads Node's built-in `node:sqlite`.
- Health endpoint confirms runtime selection without touching external services.
- Local Node SQLite migration and Node/D1 adapter contract tests pass.

## Stage 2 — authentication and permissions: implementation started

- Alist-compatible SHA-256 static password hashing and salted password hashes.
- HS256 JWTs with `username`, `pwd_ts`, issue/not-before/expiry claims; password timestamp invalidation and token revocation.
- Login attempt throttling, TOTP verification and QR generation, client/device keys, device session TTL and max-device policy.
- Guest/admin role seeding, role permission-scope bitmasks, registration gate, current-user/profile/logout/public-settings APIs.
- Initial admin user and role list/get/create/update/delete APIs.
- Prisma migrations add Role, Session, RevokedToken, LoginAttempt and Setting metadata.

The auth routes are not yet fully equivalent: LDAP, SSO, WebAuthn/passkeys, SSH keys, full session-management endpoints and every admin user/role edge case remain open. Run the CI suite before marking Stage 2 complete.

## Not yet migrated
Authentication, permissions, storage drivers, file APIs, WebDAV, search, task execution, previews/media, administration UI, internationalization, and deployment remain unimplemented and must be tracked in later stages.
