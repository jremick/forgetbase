FROM node:26.12.1-alpine@sha256:40cd011b55415bc894e45b02fdd5a5dfde056921b7d23a64c74f80497af48797 AS build

RUN apk add --upgrade --no-cache 'libcrypto3>=3.5.8-r0' 'libssl3>=3.5.8-r0'

WORKDIR /app

RUN npm install --global pnpm@11.7.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json vitest.config.ts ./
COPY apps ./apps
COPY packages ./packages

RUN pnpm install --frozen-lockfile
RUN pnpm build

FROM node:26.12.1-alpine@sha256:40cd011b55415bc894e45b02fdd5a5dfde056921b7d23a64c74f80497af48797 AS runtime

RUN apk add --upgrade --no-cache 'libcrypto3>=3.5.8-r0' 'libssl3>=3.5.8-r0'

WORKDIR /app

RUN npm install --global pnpm@11.7.0

COPY --from=build --chown=node:node /app /app

RUN mkdir -p /var/lib/forgetbase/attachments \
  && chown -R node:node /var/lib/forgetbase

USER node

CMD ["pnpm", "--filter", "@forgetbase/api", "start"]
