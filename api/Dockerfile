FROM docker.io/library/node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY src ./src
# Looking up a bridge that is not running (its name does not exist) holds one of Node's few lookup threads for seconds; with the default four, a handful of those
# stalled every other request, even to bridges that are running. More threads, and (see app.ts) such bridges are not asked again for ten minutes.
ENV UV_THREADPOOL_SIZE=32
USER node
CMD ["npx", "tsx", "src/main.ts"]
