# Task Manager for a Small Workshop

A task and order management system for a small manufacturing workshop (sewing/repair, tarpaulin and
seat-cushion production lines). The workshop owner creates and prioritises work, a coordinator
distributes tarpaulin jobs, and workers receive, acknowledge and report progress on their jobs from a
mobile app.

The repository is a monorepo with two applications:

| Folder    | What it is                                    | Stack                                              |
|-----------|-----------------------------------------------|----------------------------------------------------|
| `api/`    | REST backend                                  | NestJS 12, Prisma 7, PostgreSQL, TypeScript        |
| `mobile/` | Mobile app for owner, coordinator and workers | React Native 0.86, Expo SDK 57, React Native Paper |

The UI and domain vocabulary are in Vietnamese (e.g. `may_va` = sewing/repair, `bat` = tarpaulin,
`dem` = seat cushions); code identifiers and this documentation are in English.

## Features

**Roles**: `owner`, `worker`, `bat_coordinator` (coordinator of the tarpaulin line). Permissions are
enforced on the server with role guards plus per-resource checks in services, not only hidden in the UI.

**Tasks**
- Owner creates tasks (typed or by voice) and assigns them directly to one or more workers.
- Tarpaulin tasks go to a queue first; the coordinator (or owner) splits them among tarpaulin workers.
- Task lifecycle `new → acked → in_progress → done`, with an event log (who did what and when).
- Owner reorders priorities by drag and drop; the server reassigns priorities from the full list.
- Workers and the coordinator can log work they did themselves; the owner approves or rejects it
  (with an optional per-person auto-approve setting).
- Background reminders (polling every 15 minutes) push notifications for tasks not acknowledged
  after 2 hours or due within 2 hours, with a cooldown so the same task is not spammed.

**Orders (seat-cushion line)**
- Customer lookup by phone, order creation with photos, measurements, price and deposit.
- Multi-stage workflow: measuring → owner confirms cutting figures → parallel production steps are
  generated automatically → stuffing → ready for delivery → delivered (and remaining amount collected).
- Group queues: workers belong to specialised groups and claim queued jobs; concurrent claims and
  double submits are handled with conditional updates and a unique `(orderId, step)` constraint.
- Delivery routes/areas configured by the owner; area suggestion for new orders.
- Price and deposit are only returned to the owner.

**Authentication and devices**
- Owner signs in with email and password (bcrypt).
- Workers have no passwords: the owner issues a short-lived 6-digit pairing code shown as a QR code,
  the worker scans it once and the device is paired. Paired devices can be listed and revoked;
  revocation takes effect on the next request. "Log out everywhere" for the owner via a token version.
- Rate limiting on login and pairing endpoints.

**Operations**
- Structured JSON logging with a request id per request, global exception filter that never leaks
  internal errors, optional Sentry reporting, `/health` endpoint, Helmet, configurable CORS.
- Push notifications through the Expo Push API; optional PostHog event tracking in the app.
- In-app feedback form.

## Architecture

```
┌──────────────────────────┐      HTTPS / JSON (JWT bearer)      ┌────────────────────────┐
│  mobile/ (Expo app)      │ ─────────────────────────────────▶  │  api/ (NestJS)         │
│  owner / coordinator /   │                                     │  auth, users, tasks,   │
│  worker navigators       │ ◀──── Expo push notifications ───── │  orders, customers,    │
└──────────────────────────┘                                     │  routes, feedback      │
                                                                 └───────────┬────────────┘
                                                                             │ Prisma
                                                                     ┌───────▼───────┐
                                                                     │  PostgreSQL   │
                                                                     └───────────────┘
```

- **API**: one NestJS module per domain area (`auth`, `users`, `tasks`, `orders`, `customers`, `routes`,
  `notifications`, `feedback`, `health`). A global `JwtAuthGuard` and `RolesGuard` protect every route
  unless marked `@Public()`. DTOs are validated with `class-validator`.
- **Data model** (`api/prisma/schema.prisma`): `User`, `DevicePairing`, `Task`, `TaskAssignee`,
  `TaskEvent`, `Customer`, `Route` (delivery area), `Order`, `Feedback`. Migrations live in `api/prisma/migrations`.
- **Mobile**: React Navigation with a separate navigator per role, a small fetch-based API client
  with the JWT stored in `expo-secure-store`, voice capture via `expo-speech-recognition` with a local
  utterance parser that extracts the assignee (fuzzy, accent-insensitive name matching), production line, measurements and due date.

## Running locally

Requirements: Node.js 24, npm, Docker (for PostgreSQL), and Expo Go or an Android/iOS emulator.

### 1. Database

```bash
docker compose up -d        # PostgreSQL 16 on localhost:5432 (see docker-compose.yml)
```

### 2. API

```bash
cd api
cp .env.example .env        # adjust values if needed
npm ci                      # .npmrc enables legacy-peer-deps (see note below)
npx prisma migrate deploy
npm run db:seed             # owner account + sample workers with placeholder names
npm run start:dev           # http://localhost:3000
```

The seed prints the owner email and password it used (`OWNER_SEED_EMAIL` / `OWNER_SEED_PASSWORD`).

### 3. Mobile app

```bash
cd mobile
cp .env.example .env        # set EXPO_PUBLIC_API_URL (use your LAN IP on a physical device)
npm ci
npx expo start
```

Some features (speech recognition, push notifications) need a development build rather than Expo Go.
The native `android/` and `ios/` folders are not committed; generate them with:

```bash
npx expo prebuild
npx expo run:android        # or: npx expo run:ios
```

## Tests

```bash
cd api
npm run lint
npm run build
npm run test:e2e            # needs a reachable PostgreSQL in DATABASE_URL with migrations applied
```

The e2e suites (`api/test/*.e2e-spec.ts`) boot the real `AppModule` against a real PostgreSQL
database and call it over HTTP with Supertest (no mocks). They cover the core task flows, the
seat-cushion order flow, permissions per role, double-submit/race cases, soft delete, feedback and
self-logged tasks. `npm run test` runs unit tests (`*.spec.ts`; there are currently none).

For the mobile app: `cd mobile && npm run typecheck`.

CI (`.github/workflows/ci.yml`) runs build, lint and e2e tests for the API against a PostgreSQL
service container, and a type check for the mobile app.

## Project structure

```
.
├── api/
│   ├── prisma/            schema, migrations, seed
│   ├── src/
│   │   ├── auth/          owner login, device pairing (QR), device revocation
│   │   ├── users/         staff list, groups, push tokens, auto-approve
│   │   ├── tasks/         task CRUD, queues, approvals, reminders
│   │   ├── orders/        seat-cushion orders and their production steps
│   │   ├── customers/     customer lookup
│   │   ├── routes/        delivery areas
│   │   ├── notifications/ Expo push
│   │   ├── feedback/      in-app feedback
│   │   ├── health/        health check
│   │   └── common/        guards, decorators, validators, logging, exception filter
│   └── test/              e2e tests
├── mobile/
│   ├── App.tsx
│   └── src/
│       ├── navigation/    per-role navigators
│       ├── screens/       app screens
│       ├── api/           HTTP client and shared types
│       ├── auth/          auth context
│       ├── voice/         speech-to-task parsing
│       ├── tasks/ orders/ common/ theme/ notifications/ analytics/
├── docker-compose.yml     local PostgreSQL
└── .github/workflows/     CI
```

## Notes

- `@nestjs/throttler` 6.5 declares a peer range up to NestJS 11 while the API uses NestJS 12, so
  `api/.npmrc` sets `legacy-peer-deps=true` for `npm ci` to succeed.
- All people, customer and place names in seed data and tests are placeholders.

## License

MIT, see [LICENSE](LICENSE).
