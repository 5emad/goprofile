# Builds the static site; deploy.sh exports /dist with `docker build --output`.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ARG VITE_SERVER_KEY=""
ENV VITE_SERVER_KEY=$VITE_SERVER_KEY
RUN npm run build

FROM scratch
COPY --from=build /app/dist /dist
