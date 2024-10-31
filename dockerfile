# Use Node.js LTS (Long Term Support) as base image
FROM node:20-slim

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies including TypeScript and types
RUN npm install && \
    npm install typescript @types/node ts-node --save-dev

# Copy source code and config files
COPY . .

# Build TypeScript code
RUN npm run build

# Set environment variables
ENV NODE_ENV=production

# Copy deploy script
COPY src/deploy-commands.ts ./src/

# Add a startup script
COPY start.sh ./
RUN chmod +x start.sh

# Use the startup script as entrypoint
CMD ["./start.sh"]