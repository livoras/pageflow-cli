FROM node:22-slim

# Install pageflow-cli
RUN npm install -g pageflow-cli@latest

# Copy start script
COPY start.sh /start.sh
RUN chmod +x /start.sh

EXPOSE 4001

CMD ["/start.sh"]
