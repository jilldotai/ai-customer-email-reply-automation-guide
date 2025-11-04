FROM node:20-alpine AS base
WORKDIR /app
COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./
RUN npm ci || (npm i -g pnpm && pnpm i --frozen-lockfile) || yarn --frozen-lockfile || npm i
COPY . .
RUN npx prisma generate || true
RUN npm run build || npx tsc -p .

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/dist ./dist
COPY --from=base /app/prisma ./prisma
ENV PORT=3000
EXPOSE 3000
CMD ["node","dist/server.js"]