FROM node:10.6.0-alpine
WORKDIR /app
COPY ./package* ./
RUN npm install
COPY . .
ENV DEBUG marketplace
ENV coreAddr core:50052
CMD [ "node", "index.js" ]