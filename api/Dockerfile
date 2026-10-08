FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY src ./src
USER node
CMD ["npx", "tsx", "src/main.ts"]
