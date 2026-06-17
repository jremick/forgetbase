FROM node:22-alpine

WORKDIR /app

RUN npm install --global pnpm@11.7.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json vitest.config.ts ./
COPY apps ./apps
COPY packages ./packages

RUN pnpm install
RUN pnpm build

CMD ["pnpm", "--filter", "@agentic-cms/api", "start"]
