# One image serves the API, Socket.io and the built client from the same origin.

FROM node:24-alpine AS client-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM node:24-alpine AS server-build
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY --from=server-build /app/server/dist ./dist
# staticClient.ts expects the client build next to dist/
COPY --from=client-build /app/client/dist ./public
# The official image ships an unprivileged "node" user (uid 1000)
USER node
EXPOSE 3011
CMD ["node", "dist/index.js"]
