# ---- Build stage ----
FROM node:20-alpine AS build

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

# ---- Runtime stage ----
FROM node:20-alpine AS runtime

WORKDIR /usr/src/app

COPY --from=build /usr/src/app ./

CMD ["npm", "start"]
