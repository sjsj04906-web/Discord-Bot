# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Discord Moderator Bot

The bot runs inside the API server (`artifacts/api-server`) and starts automatically alongside Express.

**Bot files:** `artifacts/api-server/src/bot/`
- `commands/` — slash command handlers (ban, unban, kick, mute, unmute, warn, warnings, clear)
- `automod.ts` — auto-moderation (spam, caps, mentions, slurs)
- `warnings.ts` — in-memory warning store
- `index.ts` — bot startup / event wiring

**Slash commands:** /ban, /unban, /kick, /mute, /unmute, /warn, /warnings, /clear

**Required secret:** `DISCORD_BOT_TOKEN`

**Required bot intents:** Guilds, GuildMembers, GuildMessages, MessageContent, GuildModeration

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
