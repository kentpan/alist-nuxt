#!/usr/bin/env bash
set -euo pipefail
sed -i "s|from './database'|from './database.ts'|" server/utils/auth.ts
sed -i "s|import \\* as CryptoJS from 'crypto-js'|import CryptoJS from 'crypto-js'|" server/utils/auth.ts
sed -i 's/parts\[0\]/parts[0]!/g; s/parts\[1\]/parts[1]!/g; s/parts\[2\]/parts[2]!/g' server/utils/auth.ts
sed -i 's/digest\[digest.length - 1\]/digest[digest.length - 1]!/g; s/digest\[offset\]/digest[offset]!/g; s/digest\[offset + 1\]/digest[offset + 1]!/g; s/digest\[offset + 2\]/digest[offset + 2]!/g; s/digest\[offset + 3\]/digest[offset + 3]!/g' server/utils/auth.ts
sed -i "s/fromBase64url(claims)/fromBase64url(claims ?? '')/" server/utils/auth.ts
node -e "const fs=require('fs'); const p=JSON.parse(fs.readFileSync('tsconfig.json','utf8')); p.compilerOptions.allowImportingTsExtensions=true; fs.writeFileSync('tsconfig.json', JSON.stringify(p,null,2)+'\\n')"
mkdir -p server/api/me
if [ -f server/api/me.get.ts ]; then mv server/api/me.get.ts server/api/me/index.get.ts; fi
bash scripts/fix-sql.sh
