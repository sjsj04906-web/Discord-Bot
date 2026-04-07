FROM node:20-slim

WORKDIR /app

# Enable pnpm using corepack (built into Node 20+)
RUN corepack enable pnpm

# Copy only lockfile and config files first (for better caching)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc* ./
COPY artifacts/package.json ./artifacts/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy the rest of the code
COPY . .

# Build the project
RUN pnpm run build

# Start the bot (this matches what we tried earlier)
CMD ["pnpm", "--filter", "./artifacts/**", "start"]
