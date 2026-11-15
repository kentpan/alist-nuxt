#!/usr/bin/env bash
set -euo pipefail
files=(scripts/seed.ts server/api/auth/register.post.ts server/api/admin/user/create.post.ts)
sed -i "s|\"/\"|\\'/\\'|g; s|\"\"|\\'\\'|g; s|\"\\[\\]\"|\\'[]\\'|g" "${files[@]}"
perl -pi -e 's/(db\.run\()\x27INSERT/$1`INSERT/; s/\)\x27, \[/)`, [/;' "${files[@]}"
