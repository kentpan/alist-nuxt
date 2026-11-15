# Alist Nuxt migration

This repository is a staged migration of the pinned upstream Alist backend and web frontend into Nuxt 4.4.8, Tailwind CSS 3.4.19, Prisma 6, and a dual Node/Cloudflare D1 runtime.

## Source provenance
- Backend: `AlistGo/alist@92e745360766cce32564f94a468cb576f577d27e` (AGPL-3.0; original archive retained in `upload/`).
- Frontend: `AlistGo/alist-web@907756a8d5dff27d6b73036734de0a6533ace553` (original archive retained in `upload/`; upstream archive and GitHub metadata do not declare a license).
- See `upload/SHA256SUMS` and `upload/SOURCE-METADATA.txt`.

## Stage 1 status
The Nuxt runtime shell, health endpoint, Tailwind setup, initial Prisma schema/migration, and runtime-selected SQLite/D1 SQL adapter are in place. This is infrastructure only; it is not a completed Alist feature migration. No production services, credentials, databases, or storage are configured.

## Local setup
Requires Node.js >=22.13.0. Copy `.env.example` to `.env`, install dependencies with `npm install`, then run `npm run dev`. The Node adapter uses built-in `node:sqlite`; Cloudflare Workers use the `DB` D1 binding. D1 does not provide the same transactional guarantees as local SQLite; callers must not assume atomic rollback on D1.

## Verification
`npm test`, `npx prisma validate`, `npx nuxt typecheck`, and `npm run build`. All tests/builds must use an isolated local database only.
