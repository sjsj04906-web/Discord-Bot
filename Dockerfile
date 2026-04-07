FROM node:20-slim

WORKDIR /app

RUN corepack enable pnpm

# Copy config files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc* tsconfig*.json ./

# Copy source code
COPY artifacts ./artifacts
COPY scripts ./scripts
COPY lib ./lib

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build the project (this creates the .js files)
RUN pnpm run build

# Run the compiled JavaScript version of your bot
CMD ["node", "artifacts/api-server/dist/app.js"]
