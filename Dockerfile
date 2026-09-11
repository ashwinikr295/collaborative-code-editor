# Root-level Dockerfile for Render deployment
# Builds and runs the sync-server from the monorepo root context

FROM node:18-alpine

# Install compilers and runtimes for code execution
RUN apk add --no-cache g++ python3 openjdk17

# Set working directory
WORKDIR /app

# Copy and install sync-server dependencies
COPY sync-server/package*.json ./
RUN npm install

# Copy sync-server source code
COPY sync-server/ .

# Build TypeScript
RUN npm run build

# Expose the server port
EXPOSE 1234

# Start the server
CMD ["npm", "start"]
