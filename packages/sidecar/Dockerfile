FROM node:22-alpine AS builder

WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared/ ./packages/shared/
COPY packages/sidecar/ ./packages/sidecar/

RUN npm ci
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=packages/sidecar

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 duster
RUN adduser --system --uid 1001 sidecar

COPY --from=builder /app/packages/sidecar/dist ./dist
COPY --from=builder /app/packages/shared/dist ./shared
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/sidecar/package.json ./

USER sidecar
CMD ["node", "dist/index.js"]
