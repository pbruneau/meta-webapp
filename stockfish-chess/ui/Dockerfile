FROM node:16-alpine

WORKDIR /app

COPY package.json .
RUN npm install

COPY index.html .
COPY styles.css .
COPY main.js .
COPY server.js .

EXPOSE 6001

CMD ["node", "server.js"]