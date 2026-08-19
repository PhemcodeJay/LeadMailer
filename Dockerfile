FROM node:22-alpine

WORKDIR /app

# Copy package files first for better layer caching
COPY package.json ./
RUN npm install --omit=dev

# Copy application source
COPY app.js ./
COPY lib/ ./lib/
COPY public/ ./public/
COPY data/ ./data/

# Create data directory if not exists
RUN mkdir -p data/templates data/attachments data/uploads

ENV PORT=5000
EXPOSE 5000

CMD ["node", "app.js"]