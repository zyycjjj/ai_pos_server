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

## Deployment

GitHub Actions deployment is defined in `.github/workflows/deploy.yml`.

Required GitHub secrets:

- `DEPLOY_HOST`
- `DEPLOY_USER`
- `DEPLOY_SSH_KEY`
- `DATABASE_URL`

Optional repository variables:

- `DEPLOY_PATH` defaults to `/srv/ai-pos-server`
- `SERVICE_NAME` defaults to `ai-pos-server`
- `PORT` defaults to `4100`

Production `.env` is written on the server by CI and is never committed.
Systemd and Nginx starter templates live in `deploy/`.

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
