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

# Install pageflow-cli
RUN npm install -g pageflow-cli@latest

# Install Playwright browsers
RUN npx playwright install chromium

EXPOSE 3100

# Start Xvfb and pageflow (keep container running)
CMD Xvfb :99 -screen 0 1920x1080x24 & sleep 1 && DISPLAY=:99 pageflow start && sleep infinity
