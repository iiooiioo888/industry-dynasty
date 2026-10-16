# syntax=docker/dockerfile:1

FROM node:20-alpine AS build
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/sim/package.json packages/sim/
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/

RUN pnpm install --frozen-lockfile

COPY packages/sim packages/sim
COPY apps/web apps/web
COPY eslint.config.js ./

RUN pnpm --filter @industry-dynasty/sim build \
  && pnpm --filter @industry-dynasty/web build

FROM nginx:1.27-alpine AS runtime
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
