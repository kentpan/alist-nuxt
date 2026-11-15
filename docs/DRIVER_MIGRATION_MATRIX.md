# Upstream storage-driver migration matrix

Pinned backend source: `AlistGo/alist@92e745360766cce32564f94a468cb576f577d27e`.

This list is generated from the official backend archive by enumerating every `drivers/**/driver.go` directory. It is an inventory, **not** a claim that any driver has been ported. Every item remains pending until its configuration schema, credential handling, listing, metadata, download, upload, mkdir, rename, move/copy, remove, link/URL behavior, and error mapping have been implemented and tested.

Total upstream driver packages: **91**.

- [ ] `115` — not migrated
- [ ] `115_open` — not migrated
- [ ] `115_share` — not migrated
- [ ] `123` — not migrated
- [ ] `123_link` — not migrated
- [ ] `123_open` — not migrated
- [ ] `123_share` — not migrated
- [ ] `139` — not migrated
- [ ] `189` — not migrated
- [ ] `189pc` — not migrated
- [ ] `alias` — not migrated
- [ ] `alist_v2` — not migrated
- [ ] `alist_v3` — not migrated
- [ ] `aliyundrive` — not migrated
- [ ] `aliyundrive_open` — not migrated
- [ ] `aliyundrive_share` — not migrated
- [ ] `azure_blob` — not migrated
- [ ] `baidu_netdisk` — not migrated
- [ ] `baidu_photo` — not migrated
- [ ] `baidu_share` — not migrated
- [ ] `baidu_youth` — not migrated
- [ ] `bitqiu` — not migrated
- [ ] `chaoxing` — not migrated
- [ ] `chunker` — not migrated
- [ ] `cloudreve` — not migrated
- [ ] `cloudreve_v4` — not migrated
- [ ] `crypt` — not migrated
- [ ] `cstcloud_capsule` — not migrated
- [ ] `darkibox` — not migrated
- [ ] `doubao` — not migrated
- [ ] `doubao_new` — not migrated
- [ ] `doubao_share` — not migrated
- [ ] `dropbox` — not migrated
- [ ] `emby` — not migrated
- [ ] `febbox` — not migrated
- [ ] `ftp` — not migrated
- [ ] `ftps` — not migrated
- [ ] `gitee` — not migrated
- [ ] `github` — not migrated
- [ ] `github_releases` — not migrated
- [ ] `gofile` — not migrated
- [ ] `google_drive` — not migrated
- [ ] `google_photo` — not migrated
- [ ] `guangyapan` — not migrated
- [ ] `halalcloud` — not migrated
- [ ] `ilanzou` — not migrated
- [ ] `ipfs_api` — not migrated
- [ ] `kodbox` — not migrated
- [ ] `lanzou` — not migrated
- [ ] `lark` — not migrated
- [ ] `lenovonas_share` — not migrated
- [x] `local` — partial: Node local filesystem adapter and core file operations; full upstream parity and Edge adapter remain open
- [ ] `mediafire` — not migrated
- [ ] `mediatrack` — not migrated
- [ ] `mega` — not migrated
- [ ] `misskey` — not migrated
- [ ] `mopan` — not migrated
- [ ] `netease_music` — not migrated
- [ ] `onedrive` — not migrated
- [ ] `onedrive_app` — not migrated
- [ ] `onedrive_sharelink` — not migrated
- [ ] `pcloud` — not migrated
- [ ] `pikpak` — not migrated
- [ ] `pikpak_share` — not migrated
- [ ] `proton_drive` — not migrated
- [ ] `quark_uc` — not migrated
- [ ] `quark_uc_tv` — not migrated
- [ ] `quqi` — not migrated
- [ ] `s3` — not migrated
- [ ] `seafile` — not migrated
- [ ] `sftp` — not migrated
- [ ] `sjtu_netdisk` — not migrated
- [ ] `smb` — not migrated
- [ ] `streamtape` — not migrated
- [ ] `strm` — not migrated
- [ ] `teambition` — not migrated
- [ ] `template` — not migrated
- [ ] `terabox` — not migrated
- [ ] `thunder` — not migrated
- [ ] `thunder_browser` — not migrated
- [ ] `thunderx` — not migrated
- [ ] `trainbit` — not migrated
- [ ] `url_tree` — not migrated
- [ ] `uss` — not migrated
- [ ] `virtual` — not migrated
- [ ] `webdav` — not migrated
- [ ] `weiyun` — not migrated
- [ ] `wopan` — not migrated
- [ ] `wukong` — not migrated
- [ ] `yandex_disk` — not migrated
- [ ] `yunpan360` — not migrated

## Shared driver infrastructure

The backend also contains shared driver support under `internal/driver`, error mapping under `internal/errs`, operation helpers under `internal/op`, and server handlers under `server/handles`. These are dependencies of the driver implementations, not additional driver packages.

## Acceptance gate

A driver is not complete merely because its name appears in a selector. Completion requires:
1. A documented, validated configuration schema and secret-safe persistence.
2. A working provider adapter for all supported operations, with explicit unsupported-operation behavior.
3. Node runtime tests using isolated fixtures or mocks.
4. Edge/D1-compatible behavior where the provider permits it; otherwise a clearly documented runtime limitation.
5. Integration tests for auth expiry, pagination, retries, range downloads, upload completion, and provider error translation.
6. A feature-matrix entry linked to the relevant tests.

No production account, token, storage endpoint, or user data is used by migration tests.
