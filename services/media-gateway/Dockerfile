FROM node:22-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
COPY src ./src

ENV NODE_ENV=production
ENV PORT=8080
ENV MEDIA_GATEWAY_REQUIRE_AUTH=true

USER node
EXPOSE 8080
CMD ["node", "src/server.js"]
