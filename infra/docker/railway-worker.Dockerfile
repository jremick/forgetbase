FROM node:26.8-alpine@sha256:ef24c5053d50fdc3e4e56eb4e7ddb7861874ab0fdc797046ba897581deb8e868 AS build

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

FROM node:26.8-alpine@sha256:ef24c5053d50fdc3e4e56eb4e7ddb7861874ab0fdc797046ba897581deb8e868 AS runtime

RUN apk add --upgrade --no-cache 'libcrypto3>=3.5.8-r0' 'libssl3>=3.5.8-r0'

WORKDIR /app

RUN npm install --global pnpm@11.7.0

COPY --from=build --chown=node:node /app /app

ARG FORGETBASE_SOURCE_REVISION
LABEL org.opencontainers.image.revision=$FORGETBASE_SOURCE_REVISION
USER node

CMD ["sh", "-c", "pnpm db:migrate && pnpm --filter @forgetbase/worker start"]
