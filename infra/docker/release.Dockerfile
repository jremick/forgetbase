FROM node:22-alpine AS build

WORKDIR /app

RUN npm install --global pnpm@11.7.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json vitest.config.ts ./
COPY apps ./apps
COPY packages ./packages

RUN pnpm install --frozen-lockfile
RUN pnpm build

FROM node:22-alpine AS node-runtime

WORKDIR /app
RUN npm install --global pnpm@11.7.0
COPY --from=build --chown=node:node /app /app
RUN mkdir -p /var/lib/forgetbase/attachments \
  && chown -R node:node /var/lib/forgetbase
USER node

FROM node-runtime AS api
CMD ["pnpm", "--filter", "@forgetbase/api", "start"]

FROM node-runtime AS worker
CMD ["pnpm", "--filter", "@forgetbase/worker", "start"]

FROM node-runtime AS migrate
CMD ["pnpm", "db:migrate"]

FROM nginx:1.27-alpine AS web
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY infra/docker/nginx.web.conf /etc/nginx/conf.d/default.conf

FROM nginx:1.27-alpine AS proxy
COPY infra/docker/nginx.same-origin.conf /etc/nginx/conf.d/default.conf
