# description: Imagen reproducible del frontend Next.js.
# context: Servir la UI en local y base del despliegue en Vercel.

FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]
