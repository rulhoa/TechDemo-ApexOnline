FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY scheduler.js ./scheduler.js
CMD ["npm", "start"]
