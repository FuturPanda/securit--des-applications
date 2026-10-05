FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

FROM alpine:3.24
RUN apk add --no-cache libstdc++ && addgroup -S app && adduser -S app -G app
COPY --from=build /usr/local/bin/node /usr/local/bin/node
WORKDIR /app
COPY --from=build /app /app
USER app
EXPOSE 3009
CMD ["./node_modules/.bin/tsx", "src/server.ts"]
