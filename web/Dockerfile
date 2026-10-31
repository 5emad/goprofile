# Builds the static site; deploy.sh exports /dist with `docker build --output`.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ARG NEXT_PUBLIC_SERVER_KEY=""
ENV NEXT_PUBLIC_SERVER_KEY=$NEXT_PUBLIC_SERVER_KEY NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM scratch
COPY --from=build /app/out /dist
