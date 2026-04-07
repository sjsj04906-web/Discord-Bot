FROM node:20-slim

WORKDIR /app

# Enable pnpm
RUN corepack enable pnpm

# Copy configuration files first
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc* tsconfig*.json ./

# Copy the folders that actually exist in your repo
COPY artifacts ./artifacts
COPY scripts ./scripts

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build the project (this creates the compiled JS files)
RUN pnpm run build

# Run your bot (using the compiled version if possible, or ts-node as fallback)
CMD ["npx", "ts-node", "--esm", "artifacts/api-server/src/app.ts"]
