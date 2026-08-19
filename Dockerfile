FROM node:20-slim

WORKDIR /app

COPY package.json ./

RUN npm install

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "dist/bot.js"]
