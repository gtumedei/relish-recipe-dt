FROM denoland/deno:2.6.1

# Install yt-dlp and ffmpeg (ffprobe is built into ffmpeg)
RUN apt-get update && apt-get install -y \
  python3 \
  ffmpeg \
  curl \
  && rm -rf /var/lib/apt/lists/*
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
  && chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app
COPY . .

# Cache dependencies and generate Prisma code
RUN deno install --allow-scripts
RUN deno task db:generate

# Start the web server
WORKDIR /app/apps/api
CMD ["deno", "task", "start"]

EXPOSE 8000
