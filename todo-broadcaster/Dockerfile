FROM node:20-alpine
WORKDIR /usr/src/app
COPY package.json package-lock.json* ./
RUN npm ci --only=production || npm i --only=production
COPY index.js ./
CMD ["npm", "start"]
