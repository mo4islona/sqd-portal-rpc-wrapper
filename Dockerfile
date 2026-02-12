FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY tsconfig*.json ./
COPY src ./src
RUN npm run build
RUN npm prune --omit=dev

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist/src ./dist
COPY --from=build /app/node_modules ./node_modules
COPY package.json ./package.json
EXPOSE 8080
CMD ["node", "dist/index.js"]
