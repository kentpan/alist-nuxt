# API coverage matrix (pinned backend)

Status values: `implemented` means a route exists in this migration; it does not imply complete parity until contract tests pass. `pending` means not migrated.

| Upstream API group | Routes/features | Status | Notes |
|---|---|---|---|
| Auth | `/api/auth/login`, `/api/auth/login/hash` | implemented | Raw password and upstream static-hash login paths; SHA-256 compatibility tests |
| Auth | `/api/auth/register` | implemented | Gated by `allow_register`; default role assignment |
| Auth | `/api/me`, `/api/me/update`, `/api/auth/logout` | implemented | Current-user payload, password timestamp invalidation, token revocation and session deactivation |
| Auth | `/api/auth/2fa/generate`, `/api/auth/2fa/verify` | implemented | TOTP HMAC-SHA1 and QR data URL |
| Auth | LDAP login | pending | Requires LDAP configuration and integration tests |
| Auth | SSO redirect/callback/token exchange | pending | Provider-specific OAuth/SAML behavior not yet migrated |
| Auth | WebAuthn registration/login/credential management | pending | Requires challenge/session persistence and browser authenticator tests |
| Auth | SSH public key management | pending | Pending |
| User/session | Device session creation, refresh, TTL, max devices, evict-oldest/deny policy | implemented | Session list/evict APIs remain pending |
| User/session | `/api/me/sessions`, `/api/me/sessions/evict`, `/api/admin/session/list`, `/api/admin/session/evict` | implemented | Needs concurrency and eviction contract tests |
| Public | `/api/public/settings` | implemented | Only settings flagged public/read-only are returned |
| Admin users | list/get/create/update/delete/cancel_2fa | implemented | Needs full pagination/filter/edge-case contract tests |
| Admin roles | list/get/create/update/delete | implemented | Path scopes are normalized and stored as JSON |
| Admin | local storage list/create | partial | Local driver only; update/delete, driver catalog, storage test/enable/disable and remaining admin settings are pending |\n| Admin | metadata, settings CRUD, message, index lifecycle, labels, external downloader settings, FRP | pending | Subsequent stages |
| Filesystem | `/api/fs/list`, `/api/fs/get`, mkdir, rename, move, copy, remove, raw upload, download | partial | Implemented for the local Node driver; pagination, range/proxy, batch semantics, cross-driver operations, search and archive remain pending |
| Share | `/api/share/*`, public share auth/list/get | pending | Subsequent stages |
| Protocols | WebDAV, S3, FTP, SFTP | pending | Subsequent stages |

## Security/compatibility notes

- The backend's built-in admin role uses role ID `2`, guest role ID `1`; the local seed preserves these IDs.
- Password hashing follows upstream `StaticHash` + salted SHA-256 `TwoHashPwd` format.
- The backend's `Authorization` header accepts a raw token; this migration also accepts `Bearer <token>`.
- The admin API token is read from the private `token` setting or local `ADMIN_TOKEN` runtime configuration.
- No production secrets, database or storage are provisioned by migrations or tests.
