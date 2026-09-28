FROM node:26.10.0-alpine@sha256:0b36e8c136b94cd4fcf02188228e76c31ad5872eef3fec8cbd2eee500cfd9e80 AS build

RUN apk add --upgrade --no-cache 'libcrypto3>=3.5.8-r0' 'libssl3>=3.5.8-r0'

WORKDIR /app

RUN npm install --global pnpm@11.7.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json vitest.config.ts ./
COPY apps ./apps
COPY packages ./packages
COPY scripts/write-build-manifest.mjs ./scripts/write-build-manifest.mjs
ARG FORGETBASE_SOURCE_REVISION
ARG FORGETBASE_SOURCE_DATE_EPOCH
ARG FORGETBASE_RELEASE_VERSION
ARG VITE_ENABLE_RICH_EDITOR=false
RUN node scripts/write-build-manifest.mjs

RUN pnpm install --frozen-lockfile
RUN pnpm build

FROM node:26.10.0-alpine@sha256:0b36e8c136b94cd4fcf02188228e76c31ad5872eef3fec8cbd2eee500cfd9e80 AS node-runtime

RUN apk add --upgrade --no-cache 'libcrypto3>=3.5.8-r0' 'libssl3>=3.5.8-r0'

WORKDIR /app
RUN npm install --global pnpm@11.7.0
COPY --from=build --chown=node:node /app /app
RUN mkdir -p /var/lib/forgetbase/attachments \
  && chown -R node:node /var/lib/forgetbase
ARG FORGETBASE_SOURCE_REVISION
LABEL org.opencontainers.image.revision=$FORGETBASE_SOURCE_REVISION
USER node

FROM node-runtime AS api
CMD ["pnpm", "--filter", "@forgetbase/api", "start"]

FROM node-runtime AS worker
CMD ["pnpm", "--filter", "@forgetbase/worker", "start"]

FROM node-runtime AS migrate
CMD ["pnpm", "db:migrate"]

FROM nginx:1.31.0-alpine-slim@sha256:241b0d0fe06250e026e7a35a008d022c9a1d3bec19442d65cc33b84d0b5dd64d AS web
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY infra/docker/nginx.web.conf /etc/nginx/conf.d/default.conf
RUN sed -i 's|^pid .*;|pid /tmp/nginx.pid;|' /etc/nginx/nginx.conf \
  && chown -R nginx:nginx /etc/nginx/conf.d /var/cache/nginx /var/run
USER nginx

FROM nginx:1.31.0-alpine-slim@sha256:241b0d0fe06250e026e7a35a008d022c9a1d3bec19442d65cc33b84d0b5dd64d AS proxy
COPY infra/docker/nginx.same-origin.conf /etc/nginx/conf.d/default.conf
RUN sed -i 's|^pid .*;|pid /tmp/nginx.pid;|' /etc/nginx/nginx.conf \
  && chown -R nginx:nginx /etc/nginx/conf.d /var/cache/nginx /var/run
USER nginx
