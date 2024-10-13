FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

ARG NODE_ENV
ARG COMMIT_HASH

ENV NODE_ENV=${NODE_ENV}
ENV COMMIT_HASH=${COMMIT_HASH}

RUN npm run build

CMD ["npm", "start"]
