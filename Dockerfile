FROM oven/bun:1

WORKDIR /app

COPY package.json bun.lock ./
COPY prisma ./prisma

RUN bun install --frozen-lockfile && bunx prisma generate

COPY src ./src

ENV NODE_ENV=production
EXPOSE 3000

CMD ["bun", "run", "src/server.ts"]
