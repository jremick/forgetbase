FROM node:22.23.2-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS build

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
RUN pnpm --filter @forgetbase/web build

FROM nginx:1.30.4-alpine-slim@sha256:77da26c31397bf6694b4bf93275f5b40b0b120ba1b8f114264b603e592c561d6

ENV PORT=8080
ENV FORGETBASE_API_UPSTREAM_PORT=8080

COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY infra/docker/nginx.railway-proxy.conf.template /etc/nginx/conf.d/default.conf.template

RUN sed -i 's|^pid .*;|pid /tmp/nginx.pid;|' /etc/nginx/nginx.conf \
  && chown -R nginx:nginx /etc/nginx/conf.d /var/cache/nginx /var/run

ARG FORGETBASE_SOURCE_REVISION
LABEL org.opencontainers.image.revision=$FORGETBASE_SOURCE_REVISION
USER nginx

CMD ["sh", "-c", "envsubst '$$PORT $$FORGETBASE_API_UPSTREAM_PORT' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
