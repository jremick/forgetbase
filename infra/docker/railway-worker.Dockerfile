FROM node:26.12.1-alpine@sha256:40cd011b55415bc894e45b02fdd5a5dfde056921b7d23a64c74f80497af48797 AS build

RUN apk add --upgrade --no-cache 'libcrypto3>=3.5.8-r0' 'libssl3>=3.5.8-r0'

WORKDIR /app

RUN npm install --global pnpm@11.7.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json vitest.config.ts ./
COPY apps ./apps
COPY packages ./packages
COPY scripts/write-build-manifest.mjs ./scripts/write-build-manifest.mjs

ARG FORGETBASE_SOURCE_REVISION
ARG RAILWAY_GIT_COMMIT_SHA
ARG FORGETBASE_SOURCE_DATE_EPOCH
ARG FORGETBASE_RELEASE_VERSION
RUN node scripts/write-build-manifest.mjs

RUN pnpm install --frozen-lockfile
RUN pnpm build

FROM node:26.12.1-alpine@sha256:40cd011b55415bc894e45b02fdd5a5dfde056921b7d23a64c74f80497af48797 AS runtime

RUN apk add --no-cache ca-certificates \
  && apk upgrade --no-cache ca-certificates ca-certificates-bundle \
  && for package in ca-certificates ca-certificates-bundle; do \
       installed="$(apk info -v --installed "$package" | grep -E "^${package}-[0-9]+-r[0-9]+$")" \
       && version="${installed#${package}-}" \
       && test "$(apk version -t "$version" 20261020-r0)" != '<' \
       && printf '%s\n' "$installed" || exit 1; \
     done
# TODO(emudhra-2026-10): drop --use-openssl-ca / SSL_CERT_FILE once the Node release containing nodejs/node#66871 ships and the base image is bumped
ENV NODE_OPTIONS="--use-openssl-ca" \
    SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt

RUN apk add --upgrade --no-cache 'libcrypto3>=3.5.8-r0' 'libssl3>=3.5.8-r0'

WORKDIR /app

RUN npm install --global pnpm@11.7.0

COPY --from=build --chown=node:node /app /app

# Preserve pnpm's startup sequence and working directories; tsx forwards Node flags.
RUN node -e "const fs=require('fs');for(const [file,key,before,after] of [['apps/worker/package.json','start','node dist/index.js','node --use-openssl-ca dist/index.js'],['packages/db/package.json','migrate','tsx src/migrate.ts','tsx --use-openssl-ca src/migrate.ts']]){const p=JSON.parse(fs.readFileSync(file,'utf8'));if(p.scripts[key]!==before)throw Error('Unexpected startup command in '+file);p.scripts[key]=after;fs.writeFileSync(file,JSON.stringify(p,null,2)+'\n')}"

ARG FORGETBASE_SOURCE_REVISION
LABEL org.opencontainers.image.revision=$FORGETBASE_SOURCE_REVISION
USER node

# Requires build-time egress (L3); all controls run as the runtime user.
RUN timeout 30s node --use-openssl-ca -e "require('https').get('https://dv-g3b-emudhra.we-have-a-problem.com/',()=>{console.error('EMUDHRA_UNEXPECTED_SUCCESS');process.exit(1)}).on('error',e=>{console.log('EMUDHRA_NEGATIVE '+e.code);process.exit(e.code==='UNABLE_TO_GET_ISSUER_CERT_LOCALLY'?0:1)})" \
  && timeout 30s node --use-openssl-ca -e "require('https').get('https://api.resend.com',r=>{console.log('RESEND_TLS_OK HTTP '+r.statusCode);process.exit(0)}).on('error',e=>{console.error(e.code);process.exit(1)})" \
  && timeout 30s node --use-openssl-ca -e "require('https').get('https://api.github.com/',r=>{console.log('GITHUB_TLS_OK HTTP '+r.statusCode);process.exit(0)}).on('error',e=>{console.error(e.code);process.exit(1)})"

CMD ["sh", "-c", "pnpm db:migrate && pnpm --filter @forgetbase/worker start"]
