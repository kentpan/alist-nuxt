# Pinned upstream feature inventory

Source revisions: backend `92e745360766cce32564f94a468cb576f577d27e`; frontend `907756a8d5dff27d6b73036734de0a6533ace553`.

## Verified source footprint
- Backend archive: 859 files; Go module declares Go 1.25.0.
- Frontend archive: 397 files; SolidJS + Vite application with pnpm lockfile.
- Backend driver directory count: 93.
- Backend `server/router.go` contains 134 route declaration matches in the pinned tree.
- Frontend page groups include home/file/folder/previews/uploads, login, share, and manage.

## Backend route groups to preserve
- Public and auth: login, password-hash login, LDAP, registration, SSO, WebAuthn, current-user profile, 2FA, SSH keys, sessions.
- Filesystem: read/list, upload, download/proxy, mkdir, rename/move/copy, batch operations, archive extraction/download, search.
- Shares: create/update/disable/list/delete, public share info/auth/list/get, share download/proxy.
- Admin: users, roles, metadata, storage CRUD and enable/disable/load, driver list/names/info, settings, external download tools, FRP, message endpoints, search index lifecycle, labels and file bindings, session management.
- Protocols: WebDAV, S3-compatible API, FTP, SFTP.
- Special routes: signed file/archive endpoints, robots/favicon, share pages, static SPA fallback.

## Frontend areas to migrate
- Home navigation/layout/sidebar, file and folder views, list/grid, pagination, context menus, search.
- Upload flows, streaming upload, file toolbar operations, batch rename/copy/move/delete/archive/offline-download.
- Previewers: image, video, audio, 360 video, markdown, text editor, archive, HTML, iframe, URL, metadata/info, IPA/PLIST, asciinema, office integrations.
- Login and SSO, share pages, management dashboard, users/roles/storage/drivers/settings/tasks/metas/messages/backup-restore, language packs.

## Migration status
Only Stage 1 infrastructure is implemented. None of the above business capabilities should be considered migrated until corresponding API/UI tests and the feature coverage matrix mark them complete. Driver support must be inventoried from upstream and not silently reduced. The frontend archive has no declared license in GitHub metadata or its root files; legal review is required before porting its source code.
