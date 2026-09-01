FROM node:26-alpine AS build

WORKDIR /app

RUN npm install --global pnpm@11.7.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json vitest.config.ts ./
COPY apps ./apps
COPY packages ./packages

RUN pnpm install --frozen-lockfile
RUN pnpm build

FROM node:26-alpine AS runtime

WORKDIR /app

RUN npm install --global pnpm@11.7.0

COPY --from=build --chown=node:node /app /app

USER node

CMD ["sh", "-c", "pnpm --filter @forgetbase/web exec vite preview --host 0.0.0.0 --port ${PORT:-4173}"]
