# Single-image Next.js app (UI + API routes). Needs the env vars in .env.example at runtime.
FROM node:20-alpine
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production
EXPOSE 3000
USER node
CMD ["npm", "start"]
