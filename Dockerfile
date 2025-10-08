FROM node:20-alpine

WORKDIR /app

# Copy package files and tsconfig (needed for postinstall build)
COPY package*.json tsconfig.json ./

# Copy source code (needed before npm ci because postinstall runs build)
COPY . .

# Install dependencies - postinstall will automatically run build
RUN npm ci

# Remove dev dependencies after build to reduce image size
RUN npm prune --production

# Create sessions directory
RUN mkdir -p sessions

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

# Start the application
CMD ["npm", "start"]