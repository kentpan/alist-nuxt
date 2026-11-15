# API coverage matrix (pinned backend)

Status values: `implemented` means a route exists and has the stated test coverage; `partial` means only a subset or one driver is implemented; `pending` means not migrated.

| Upstream API group | Routes/features | Status | Notes |
|---|---|---|---|
| Auth | `/api/auth/login`, `/api/auth/login/hash`, register, logout, 2FA | implemented | Password hash compatibility, JWT, TOTP, registration gate and revocation tested in Node CI |
| User/session | `/api/me`, profile update, session TTL/max devices | implemented | `/api/me` and login/session lifecycle smoke-tested; exhaustive device eviction parity remains open |
| User/session | session list/evict APIs | partial | Route implementations exist; pagination and device-eviction contract coverage remains open |
| Public | `/api/public/settings` | implemented | Only public settings are returned |
| Admin users/roles | list/get/create/update/delete | partial | Core CRUD and role scopes implemented; full upstream filters and all edge cases remain open |
| Admin storage | list/get/create/update/delete/enable/disable/load_all | partial | Local and experimental WebDav configuration CRUD; WebDAV credentials encrypted for new writes; Chinese onboarding form appears when no storage is configured, full storage management UI pending |
| Admin driver | list/names/info | partial | Catalog contains 99 upstream driver names; Local and experimental WebDav report supported |
| Filesystem read | `/api/fs/list`, `/api/fs/get`, `/api/fs/dirs` | partial | Local and experimental WebDav; loopback HTTP integration test covers actual fetch requests for PROPFIND/MKCOL/PUT/GET/range/COPY/MOVE/DELETE |
| Filesystem write | mkdir, rename, move, copy, remove, remove-empty-directory | partial | Local plus same-mount WebDav operations; loopback integration tested, cross-storage move/copy is not implemented |
| Filesystem batch | batch rename, regex rename, search | partial | Local driver only; recursive regex rename and advanced search filters remain open |
| Upload/download | `/api/fs/put`, `/api/fs/form`, `/d/*` | partial | Local Node streams plus WebDav raw/multipart uploads, range-forwarded download and signed media stream; Node API integration tested, Edge remote storage build verified |
| Archive/offline tasks | archive list/meta/decompress, offline download, task queue | pending | Not represented by fake endpoints |
| Storage drivers | 99 upstream driver names | partial | Local and experimental WebDav implemented; 97 other drivers pending |
| Share | `/api/share/*` | pending | Not migrated |
| Protocols | WebDAV | partial | Fetch-based adapter implemented; real loopback HTTP integration tested; production credential encryption, UI and provider matrix pending |
| Protocols | S3, FTP, SFTP | pending | Not migrated |
| Admin | settings, message, index lifecycle, labels, external downloader, FRP | pending | Not migrated |

## Security and compatibility notes
- Local storage requires an absolute configured root path and refuses traversal and symlink escapes.
- Local filesystem operations require the Node runtime; WebDav uses fetch and can run on Node/Edge with D1 metadata.
- WebDav remains experimental: new storage create/update operations AES-GCM encrypt username/password using `NUXT_STORAGE_CREDENTIALS_KEY`; legacy plaintext rows remain readable for migration and must be re-saved/rotated before production. A real-provider interoperability suite and admin UI configuration form remain pending.
- The backend's built-in admin role ID `2` and guest role ID `1` are preserved.
- Password hashing follows upstream `StaticHash` + salted SHA-256 `TwoHashPwd` format.
- The `Authorization` header accepts a raw token and also accepts `Bearer <token>`.
- No production secrets, databases, storage paths or deployments are provisioned by migrations or tests.
