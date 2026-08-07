**NexGen Esport — Monorepo Overview

This repository is a full-stack esports league platform (API + web) managed as a pnpm monorepo.

**Quick Links**
- **Root manifest:** [package.json](package.json)
- **API app:** [apps/api](apps/api) — entry: [apps/api/src/main.ts](apps/api/src/main.ts#L1-L60)
- **API Prisma schema:** [apps/api/prisma/schema.prisma](apps/api/prisma/schema.prisma#L1-L40)
- **Web app:** [apps/web](apps/web) — Next.js app (App Router), entry layout: [apps/web/app/layout.tsx](apps/web/app/layout.tsx#L1-L40)
- **Shared package:** [packages/shared](packages/shared)

**Prerequisites**
- Node.js (recommended v20+)
- pnpm (as configured in root `package.json`)
- Docker and Docker Compose
- PostgreSQL (for local development) or a `DATABASE_URL` pointing to a Postgres instance
- Git (optional)

**Setup (local)**
1. Install dependencies:

```bash
pnpm install
```

2. Create environment variables for local development:
- Copy `.env.example` to `.env`
- Update `DATABASE_URL`, `REDIS_URL`, and secrets as needed

3. The API validates required environment variables at boot and can use the local storage driver by default. The stack expects:
- `DATABASE_URL`
- `REDIS_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `STORAGE_DRIVER`
- `THROTTLE_TTL`
- `THROTTLE_LIMIT`
- `NEXT_PUBLIC_API_BASE_URL`

4. Validate/generate Prisma client (run from repo root):

```bash
pnpm -C apps/api prisma:validate
pnpm -C apps/api prisma generate
# To create/apply migrations locally:
# pnpm -C apps/api prisma migrate dev
```

**Docker / Containerized development**
1. Use the provided container environment file:

```bash
cp .env.docker .env.docker.local
```

2. Build and start the stack:

```bash
docker compose up --build --detach
```

4. The frontend will be available at `http://localhost:3001`, and the API at `http://localhost:3000/api/v1`.

5. Verify services are healthy:

```bash
docker compose ps
docker compose logs api --tail=100
docker compose exec db pg_isready -U postgres -d nexgen_esport
docker compose exec redis redis-cli PING
curl -i http://localhost:3000/api/v1/health
```

4. Access the database admin interface at `http://localhost:8080` using:

5. Stop the stack:

```bash
docker compose down
```

**Development**
- Start both apps (runs each package `dev` script):

```bash
pnpm -r dev
```

- Start API only:

```bash
pnpm -C apps/api dev
```

- Start Web only:

```bash
pnpm -C apps/web dev
```

**Build / Test / Lint**
- Build all packages:

```bash
pnpm -r build
```

- Run tests across the repo:

```bash
pnpm -r test
```

- Run lint across the repo:

```bash
pnpm -r lint
```

- CI quick-check (root script):

```bash
pnpm ci
```

**Notes & Tips**
- The API is built with NestJS and exposes routes under the `/api/v1` prefix (configured in `apps/api/src/main.ts`).
- Prisma schema and domain models live in `apps/api/prisma/schema.prisma` — set `DATABASE_URL` before running migrations or generating the client.
- The monorepo uses `pnpm -r` to run scripts across packages; you can target a specific package with `pnpm -C <path> <script>`.

# Nexgen_E-sport
