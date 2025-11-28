FROM node:22-slim

# Install Xvfb and Chromium dependencies
RUN apt-get update && apt-get install -y \
    xvfb \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libcairo2 \
    fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*

# Install pageflow-cli and Playwright browsers with cache mounts
# Cache mounts persist across builds, avoiding re-download when only version changes
ARG PAGEFLOW_VERSION=latest
RUN --mount=type=cache,target=/root/.npm \
    --mount=type=cache,target=/root/.cache/ms-playwright \
    npm install -g --ignore-scripts pageflow-cli@${PAGEFLOW_VERSION} && \
    npx playwright install chromium

EXPOSE 3100

# Start Xvfb and pageflow (keep container running)
CMD Xvfb :99 -screen 0 1920x1080x24 & sleep 1 && DISPLAY=:99 pageflow start && sleep infinity
