FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# Baked in at build time; empty falls back to the vite.config.ts default (/music-quiz/)
ARG VITE_BASE_PATH
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx-log.conf /etc/nginx/conf.d/00-log.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 3010
