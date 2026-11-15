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
- Node SQLite migrations, mocked D1 adapter contract tests, typecheck and Node build pass.

## Stage 2 — authentication and permissions: implemented contract
- Alist-compatible SHA-256 static password hashing and salted password hashes.
- HS256 JWTs with `username`, `pwd_ts`, issue/not-before/expiry claims; password timestamp invalidation and token revocation.
- Login throttling, TOTP verification/QR generation, device keys, session TTL and max-device policy.
- Guest/admin role seeding, permission-scope bitmasks, registration gate, current-user/profile/logout/public-settings APIs.
- Admin user and role CRUD foundations.
- Real Node-server CI covers admin login, JWT, `/api/me`, user/role APIs, public settings, registration, logout and revocation.
- Remaining auth parity: LDAP, SSO, WebAuthn/passkeys, SSH keys, and exhaustive session-management edge cases.

## Stage 3 — Local storage and filesystem: complete for Local driver
- Storage metadata migration and admin storage CRUD for Local.
- Upstream-derived catalog of 99 driver names; Local is implemented, 98 remote/provider drivers remain explicitly pending.
- Local filesystem operations: list/get/dirs/mkdir/rename/move/copy/remove/batch rename/regex rename/search, stream/multipart upload and range-aware download.
- Local root confinement rejects traversal and symlink escapes. Local filesystem access is Node-only.
- Upstream Local storage API integration tests and isolated filesystem API tests pass.

## Stage 4 — Nuxt file browser: complete for the implemented browser contract
- Chinese-language login and file-management UI.
- Local storage setup, directory navigation, folder creation, file upload, selection, rename, copy, move and delete.
- Real Chromium CI passes login, folder creation, upload, rename and delete against the isolated Node server.
- Remaining UI parity: full upstream admin console, storage/driver configuration forms for every provider, internationalization catalogue, shares and advanced file operations.

## Stage 5 — signed media preview and Edge compatibility: validated
- HMAC-SHA-256 signed media URLs using WebCrypto, with path binding and expiry.
- Range-aware stream endpoint supports browser media seeking without exposing a bearer token in an HTML media element.
- Browser preview for images, video, audio, PDF and text files.
- CI passed on commit `ffa3ba01927e491f4a13293c8c7611cadcff69e7`: unit tests, Prisma validation, Nuxt typecheck, Node build, Cloudflare Pages Edge build and generated Worker entrypoint check.
- Isolated Chromium CI passed login, folder creation, upload, signed text preview, rename and delete; API smoke tests passed authentication and Local filesystem operations. No deployment is performed.
- Cloudflare Edge can use D1 for metadata; Local filesystem storage remains intentionally Node-only. A supported remote Edge storage driver is still required for actual file access on Edge.

## Stage 6 — remaining upstream parity and release: in progress
- WebDAV is now wired into storage resolution and the filesystem API for list/get/dirs, mkdir, raw and multipart upload, rename, same-mount move/copy, remove, recursive search, download and signed range-aware media streaming. The fetch-based adapter is compatible with Node and Edge runtimes; Edge requires D1 for metadata.
- Mocked tests cover WebDAV listing/metadata, URL encoding, mount confinement, auth failures, PUT, MOVE, COPY, range GET, configuration validation and storage resolver dispatch. An additional Node integration test now starts an isolated loopback HTTP server and exercises real fetch-based PROPFIND, MKCOL, PUT, GET/range, COPY, MOVE and DELETE requests; the full Node API smoke test passed storage CRUD, upload, signed range preview, download range, rename, copy, move, remove and recursive search on commit `2d4932d7d07d2f4a22c95dd4cea5a0a55a764d74`. Stage 5 Node build, Cloudflare Edge build, isolated D1-backed API tests and Chromium browser interaction all passed; no real external WebDAV server or production credentials are used.
- WebDAV remains experimental: new admin create/update writes encrypt username/password with AES-GCM and require `NUXT_STORAGE_CREDENTIALS_KEY` (32+ characters); the key must be backed up separately and never committed. Legacy plaintext rows remain readable for compatibility and must be re-saved/rotated before production use. No admin UI form, cross-storage move/copy, real-provider interoperability matrix or end-to-end D1+WebDAV Edge test yet.
- Next: add tests for credential-key rotation and legacy-row migration, add a WebDAV configuration UI and test against a separately managed disposable WebDAV server, then S3, archive/task/share/admin parity.
- Archive listing/extraction, offline download/task queue, shares, full admin settings/index/labels/message/FRP features.
- Full feature-by-feature parity matrix, Node/Edge integration against a real isolated D1 emulator, security review, clean `alist-nuxt-v1.0.0.zip` and final verification.

All CI tests use isolated temporary databases and storage. No production service, credential, database, storage or deployment is used.
