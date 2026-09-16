# --- Build the frontend ---
FROM node:22-slim AS client-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

# --- Runtime image: just the API server + built frontend ---
FROM node:22-slim
WORKDIR /app/server
COPY server/package*.json ./
RUN npm install --omit=dev
COPY server/ ./
COPY --from=client-build /app/client/dist /app/client/dist

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000

# All data lives in Postgres (DATABASE_URL) — no local volume needed.
CMD ["node", "index.js"]
