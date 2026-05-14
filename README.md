# AI POS Server

NestJS API for the AI POS MVP.

## Stack

- NestJS
- ZenStack + Prisma + MySQL
- ZenStack RPC CRUD at `/api/rpc`
- Generated OpenAPI at `doc/openapi.json`
- Generated React Query hooks in `../ai-pos-app/src/_/hook`
- PORT-based deployment for systemd/Nginx

## Scripts

```bash
pnpm install
pnpm zen:generate
pnpm prisma:push
pnpm start:dev
pnpm build
```

## Data Model Workflow

Edit `schema.zmodel`, then run:

```bash
pnpm zen
```

This runs:

- `prisma/schema.prisma`
- `doc/openapi.json`
- `../ai-pos-app/src/_/hook`
- `prisma db push`

AI-generated menu data should be stored as drafts first. Business tables are only written after merchant confirmation.
