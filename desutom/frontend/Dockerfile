# Stage 1: Build the React app
FROM node:14-alpine AS build

WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Build the app
RUN npm run build -- --public-url /desutom

# Stage 2: Serve the React app using 'serve'
FROM node:14-alpine

WORKDIR /app

# Install 'serve' globally
RUN npm install -g serve

# Copy the build artifacts from the previous stage
COPY --from=build /app/build ./build

EXPOSE 3000

# Start the app using 'serve'
CMD ["npx", "serve", "-s", "build", "-l", "3000"]
