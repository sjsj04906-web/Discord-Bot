FROM node:20-slim

WORKDIR /app

# Enable pnpm
RUN corepack enable pnpm

# Copy all config files first (important for TypeScript monorepo)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc* tsconfig*.json ./

# Copy the artifacts folder (your bot code)
COPY artifacts ./artifacts

# Also copy scripts and lib if they exist (safe to include)
COPY scripts ./scripts
COPY lib ./lib

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build the entire workspace
RUN pnpm run build

# Start the bot from the artifacts workspace
CMD ["pnpm", "--filter", "./artifacts/**", "start"]
