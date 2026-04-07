FROM node:20-slim

WORKDIR /app

# Enable pnpm
RUN corepack enable pnpm

# Copy root config files first
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc* ./

# Copy the artifacts folder (this is where your bot lives)
COPY artifacts ./artifacts

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build the project
RUN pnpm run build

# Start the bot
CMD ["pnpm", "--filter", "./artifacts/**", "start"]
