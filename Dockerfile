FROM node:24-alpine AS build
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /usr/src/app/build ./build
# Rooms are stored here, mount a volume to keep them across container updates
ENV DATA_DIR=/usr/src/app/data
RUN mkdir -p "$DATA_DIR" && chown node:node "$DATA_DIR"
USER node
EXPOSE 8080
CMD [ "node", "build/index.js" ]
