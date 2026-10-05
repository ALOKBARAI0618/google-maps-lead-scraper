# Google Maps lead scraper — headless deployment image.
# Built for arm64 (Raspberry Pi 4B). The browser is the only heavyweight
# dependency, so it is installed with --with-deps to pull the NSS/atk/egl
# libraries Chromium needs; without them Playwright reports a misleading
# "executable not found" that is really a missing shared library.
FROM node:20-bookworm-slim

# Playwright's own dependency installer needs to apt-get, so create a
# throwaway apt cache that stays inside the image layer.
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install production dependencies first. Doing this before copying the source
# means a code change does not invalidate this layer and reinstall 280MB of
# node_modules on every build.
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

# Chromium for arm64. PLAYWRIGHT_BROWSERS_PATH keeps the download inside the
# image's own cache dir rather than a user home that may not exist.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN npx playwright install --with-deps chromium

# Application source. The diagnostic/probe scripts are included too - they are
# useful from inside the container when a city looks wrong - but output/ and
# state files are excluded by .dockerignore so the image stays small and a
# rebuild can never wipe a running campaign's progress.
COPY . .

# output/ must exist even on a fresh image, or the scraper's save path fails.
RUN mkdir -p output

# Server (UI + queue) on 3000. The scraper children are spawned by the server,
# not exposed.
EXPOSE 3000

# JSON logging with no colour codes, since logs go to docker logs / Jenkins.
ENV LOG_LEVEL=info
CMD ["node", "server.js"]
