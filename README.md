# Alist Nuxt migration

Stage 0 source acquisition workflow. On push to main, GitHub Actions downloads the exact pinned upstream source archives and uploads them as the `alist-official-source-archives` artifact.

Pinned upstream revisions:
- Backend: `AlistGo/alist@92e745360766cce32564f94a468cb576f577d27e`
- Frontend: `AlistGo/alist-web@907756a8d5dff27d6b73036734de0a6533ace553`

This bootstrap commit contains no upstream source copies yet; the workflow artifact is the transfer channel for retrieving and verifying the original archives.
