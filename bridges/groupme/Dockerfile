FROM docker.io/library/node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY src ./src
USER node
CMD ["node_modules/.bin/tsx", "src/main.ts"]
