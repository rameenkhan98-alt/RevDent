FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build && npm prune --omit=dev
ENV PORT=8080 DATA_FILE=/data/schedules.json
VOLUME /data
EXPOSE 8080
CMD ["node", "server.js"]
