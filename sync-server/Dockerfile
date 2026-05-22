# Start from a lightweight Linux image with Node.js 18 installed
FROM node:18-alpine

# Install Docker CLI, compilers, and runtimes for host/sandbox execution
RUN apk add --no-cache docker-cli g++ python3

# Set the working directory inside the container
WORKDIR /app

# Copy the package.json and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of your backend code (including LevelDB logic and WebSocket server)
COPY . .

# Build the TypeScript code
RUN npm run build

# Expose the port your WebSocket server runs on
EXPOSE 1234

# Start the Node.js server from the compiled output
CMD ["npm", "start"]
