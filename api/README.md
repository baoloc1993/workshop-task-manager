# API (NestJS + Prisma + PostgreSQL)

REST backend of the [Workshop Task Manager](../README.md). The root README has the architecture diagrams,
the data model and the full endpoint table; this file is a module map and a script reference.

## Module map

| Module (`src/`) | Responsibility |
|---|---|
| `auth/` | Owner login (bcrypt), pairing-code issue and redeem, device list and revoke, `logout-everywhere` (token version) |
| `users/` | Staff lists, cushion worker groups, auto-approve switch, owner push token |
| `tasks/` | Task creation and assignment, tarpaulin queue and split, cushion group queue and claim, ack / start / done, priorities, self-logged work and approval, history; `reminders.service.ts` is the 15-minute reminder job |
| `orders/` | Seat-cushion orders: create (also creates the measuring task), measurements, cut confirmation (generates the parallel step tasks), stuffing task, delivery |
| `customers/` | Customer search by name or phone |
| `routes/` | Delivery areas (called "routes" in the schema) |
| `notifications/` | The only code that calls the Expo Push API; never throws |
| `feedback/` | In-app feedback intake |
| `health/` | `GET /health` with a database ping (Terminus) |
| `prisma/` | `PrismaService` using the `pg` driver adapter |
| `common/` | `JwtAuthGuard`, `RolesGuard`, `@Public()` / `@Roles()` / `@CurrentUser()`, validators (no NUL characters, date bounds), JSON logger with request id, global exception filter, step-to-group table for cushion steps |

Cross-cutting setup lives in `main.ts` (JSON body limit 8 MB, global `ValidationPipe`, exception filter,
`helmet`, optional CORS, Sentry init) and `app.module.ts` (global guards: throttler, JWT, roles).

Rule of thumb used throughout: role lists go on the controller (`@Roles(...)`); rules that depend on a
relationship (assignee, measuring worker, worker group) are enforced in the service.

## Setup

```bash
cp .env.example .env          # see the variable table in the root README
npm ci                        # .npmrc enables legacy-peer-deps
npx prisma generate           # required once after install and after schema changes
npx prisma migrate deploy     # apply migrations (use `npm run db:migrate:dev` while developing)
npm run db:seed               # owner + placeholder staff
npm run start:dev
```

A PostgreSQL instance matching `DATABASE_URL` is needed; `docker compose up -d` at the repo root starts one.

## Scripts

| Script | Command | Notes |
|---|---|---|
| `npm run start:dev` | `nest start --watch` | Dev server with reload |
| `npm run build` | `nest build` | Output in `dist/` |
| `npm run start:prod` | `node dist/main` | Run the build |
| `npm run lint` | `oxlint src/ test/` | |
| `npm run format` | `prettier --write` | `src/` and `test/` |
| `npm run test` | `vitest run` | Unit tests (`*.spec.ts`); none exist yet, passes with no tests |
| `npm run test:e2e` | `vitest run --config ./vitest.config.e2e.ts` | 7 files, 29 tests, real PostgreSQL |
| `npm run prisma:generate` | `prisma generate` | Same as `npx prisma generate` |
| `npm run db:migrate:dev` | `prisma migrate dev` | Create and apply a migration locally |
| `npm run db:migrate:deploy` | `prisma migrate deploy` | Apply committed migrations |
| `npm run db:seed` | `tsx prisma/seed.ts` | Owner from `OWNER_SEED_*`, placeholder workers and coordinator |

## Tests

`test/*.e2e-spec.ts` boot `AppModule` through `test/utils/test-app.ts`, which also creates users directly in
the database and signs tokens with the app's own `JwtService`. The database in `DATABASE_URL` must already have
the migrations applied. Tests create their own uniquely suffixed users and tasks and delete them afterwards; still, run them against a development or
throwaway database, not one you care about.

## Prisma

- Schema: `prisma/schema.prisma`; migrations: `prisma/migrations/` (8, additive).
- Prisma 7 reads the connection string from `prisma.config.ts` for the CLI and from the driver adapter
  (`@prisma/adapter-pg`) at runtime.
- Domain values are Vietnamese abbreviations: lines `may_va` (sewing/repair), `bat` (tarpaulin), `dem` (seat
  cushions); order statuses `moi`, `dang_lam`, `cho_tra`, `da_tra`.
