# Node + Python (yt-dlp) on Alpine
FROM node:20-alpine

# yt-dlp + ffmpeg
RUN apk add --no-cache python3 py3-pip ffmpeg curl \
 && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
 && chmod +x /usr/local/bin/yt-dlp

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.mjs ./

ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "server.mjs"]
