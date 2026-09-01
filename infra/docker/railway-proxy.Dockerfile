FROM node:26-alpine AS build

WORKDIR /app

RUN npm install --global pnpm@11.7.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json vitest.config.ts ./
COPY apps ./apps
COPY packages ./packages

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @forgetbase/web build

FROM nginx:1.27-alpine

ENV PORT=8080

COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY infra/docker/nginx.railway-proxy.conf.template /etc/nginx/conf.d/default.conf.template

RUN sed -i 's|^pid .*;|pid /tmp/nginx.pid;|' /etc/nginx/nginx.conf \
  && chown -R nginx:nginx /etc/nginx/conf.d /var/cache/nginx /var/run

USER nginx

CMD ["sh", "-c", "envsubst '$$PORT' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
