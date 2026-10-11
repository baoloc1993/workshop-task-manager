# Workshop Task Manager

**A NestJS + Prisma + PostgreSQL REST API and an Expo / React Native app that let a small manufacturing workshop assign work, track it to completion and run a multi-step order workflow from the phone.**

Built for a small family workshop, as a full-stack project: API design, role-based access control, device
authentication without passwords, concurrency-safe workflows, push reminders and a mobile client.
All data in this repository is synthetic.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![NestJS](https://img.shields.io/badge/NestJS-12-E0234E?logo=nestjs&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-7-2D3748?logo=prisma&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![Expo](https://img.shields.io/badge/Expo-SDK%2057-000020?logo=expo&logoColor=white)

> **Reading in a hurry?** Jump to [Engineering highlights](#engineering-highlights) (what is interesting on
> the backend), [Trade-offs and limitations](#trade-offs-and-known-limitations) (what is deliberately simple
> or not done) and [Testing](#testing) (29 end-to-end tests against a real database).

## Contents

1. [The problem](#the-problem)
2. [Features by role](#features-by-role)
3. [Architecture](#architecture)
4. [Engineering highlights](#engineering-highlights)
5. [Trade-offs and known limitations](#trade-offs-and-known-limitations)
6. [Data model](#data-model)
7. [REST API](#rest-api)
8. [Tech stack](#tech-stack)
9. [Getting started](#getting-started)
10. [Testing](#testing)
11. [Project structure](#project-structure)
12. [Roadmap](#roadmap)
13. [License and author](#license-and-author)

## The problem

A small workshop (sewing and repair, tarpaulin work, and made-to-measure seat cushions) coordinated its work
through a chat group and a paper notebook. Tasks were lost in the scroll, nobody knew whether a job had been
seen, the owner could not see at a glance what was late, and measurements for cushion orders lived on paper.

The workers are not office workers: they use a phone, often with one hand, and should not have to remember a
password. So the system is built around three constraints:

- **The owner needs one place** to see the whole workshop, create work (by typing or by speaking), set
  priorities and track orders.
- **Workers need almost no friction**: scan a QR code once, then acknowledge / start / finish a job in one or
  two taps.
- **Permissions must be real.** Money fields and other people's work must be protected on the server, not just
  hidden in the UI.

## Features by role

Three roles exist: `owner`, `bat_coordinator` (coordinator of the tarpaulin line) and `worker` (a sewing/repair
worker, a tarpaulin worker, or a seat-cushion worker who belongs to one or more specialised groups).

| Area | Owner | Coordinator | Worker |
|---|---|---|---|
| Sign-in | Email + password | QR pairing code (no password) | QR pairing code (no password) |
| Create tasks | Typed or by voice (speech is parsed on the device into assignee, due date, line and measurements, then **always reviewed** before sending) | - | - |
| Assign tasks | Directly to sewing workers or the coordinator; splits queued tarpaulin tasks | Splits queued tarpaulin tasks among tarpaulin workers (can include self) | - |
| Work on a task | Cannot ack/start/finish on behalf of workers (blocked server-side) | Acknowledge, start, finish own tasks | Acknowledge, start, finish own tasks |
| Whole-workshop overview | Four buckets: late or stalled / in progress / unclaimed / done today | Tarpaulin queue only | Own tasks only |
| Priorities | Reorder by position; the server renumbers from the full list | - | - |
| Self-logged work | Approves or rejects; per-person **auto-approve** switch | Logs work they did themselves | Logs work they did themselves (not cushion workers: their work follows the order) |
| History | Whole workshop, week / month | Own + tarpaulin line | Own |
| Seat-cushion orders | Customer lookup by phone, create order with photos / measurements / price / deposit, confirm cutting figures, mark delivered and collect the balance, delivery areas | - | Claim queued steps of the groups they belong to; the measuring worker records measurements and a photo |
| Money (price, deposit, balance) | Only role that ever receives it | - | - |
| Devices | Issue pairing QR, list paired devices, revoke a device, "log out everywhere" | - | - |
| Push notifications | Self-logged work waiting for approval | New tarpaulin task to split; tarpaulin task nearing its due date | New task; task not acknowledged for 2 h; task due within 2 h; new queued step for their group |
| Feedback | Send from the app | Send from the app | Send from the app |

Seat-cushion orders follow a fixed pipeline: **measuring** (the `do` step) → owner **confirms the cutting
figures** → three **parallel steps** are generated (sewing the cover, cutting the foam, sewing the lining),
plus embroidery and back-pillow steps when the order needs them → when all of them are done the **stuffing**
task is generated → the order becomes **ready for delivery** → **delivered**, with the remaining balance
collected in the same action.

## Architecture

### Components

```mermaid
flowchart LR
    subgraph Phone["Expo / React Native app (mobile/)"]
        UI["Role-based navigators<br/>owner, coordinator, worker"]
        Voice["On-device speech to task parser"]
        Store["expo-secure-store<br/>(JWT + small user profile)"]
    end

    subgraph Server["NestJS API (api/)"]
        Guards["Throttler, JwtAuthGuard, RolesGuard"]
        Modules["auth, users, tasks, orders,<br/>customers, routes, feedback, health"]
        Rem["RemindersService<br/>(15-minute poll)"]
        Notif["NotificationsService"]
    end

    DB[("PostgreSQL 16<br/>via Prisma 7")]
    Expo["Expo Push API"]
    Sentry["Sentry<br/>(optional)"]
    PH["PostHog<br/>(optional, app events)"]

    UI -->|"HTTPS + JSON, Bearer JWT"| Guards
    Voice --> UI
    UI --- Store
    Guards --> Modules
    Modules --> DB
    Rem --> Modules
    Modules --> Notif
    Rem --> Notif
    Notif -->|"HTTP POST"| Expo
    Expo -.->|"push"| UI
    Server -.->|"unexpected 5xx"| Sentry
    UI -.->|"named events"| PH
```

### Task lifecycle

A task moves forward one step at a time, and only its assignees can move it. Repeating a step that has already
happened is accepted silently (idempotent); skipping a step returns `400`. Each transition writes a
`TaskEvent`, so the owner can see who acknowledged, started and finished and when.

```mermaid
stateDiagram-v2
    [*] --> new: owner creates, coordinator splits,<br/>or a queued step is generated
    [*] --> acked: worker logs own work<br/>(source = self)
    new --> acked: PATCH ack, or POST claim for a cushion step
    acked --> in_progress: PATCH start
    in_progress --> done: PATCH done
    done --> [*]
```

Self-logged tasks carry a second, independent field, `approval`. It starts as `pending` (unless the person has
auto-approve on) and can only go `pending → approved` or `pending → rejected`; the transition is a conditional
update, so two concurrent decisions cannot both win (the second gets `409`).

Orders have their own lifecycle, driven by the tasks generated for them:

```mermaid
stateDiagram-v2
    [*] --> moi: order created<br/>(measuring task generated)
    moi --> dang_lam: owner confirms cutting figures<br/>(parallel step tasks generated)
    dang_lam --> cho_tra: all parallel steps done,<br/>then stuffing task done
    cho_tra --> da_tra: owner marks delivered<br/>(balance collected)
    da_tra --> [*]
```

(`moi` = new, `dang_lam` = in production, `cho_tra` = ready for delivery, `da_tra` = delivered.)

### Device pairing, assignment and reminder

```mermaid
sequenceDiagram
    autonumber
    actor Owner
    participant API as NestJS API
    participant DB as PostgreSQL
    participant Expo as Expo Push API
    actor Worker as Worker phone

    Owner->>API: POST /auth/pairings {userId}
    API->>DB: revoke older unused codes for that person, insert 6-digit code (TTL 15 min)
    API-->>Owner: code (rendered as a QR)
    Worker->>API: POST /auth/pairings/redeem {code, deviceLabel, Expo push token}
    API->>DB: mark code used, store device + push token
    API-->>Worker: JWT (contains the pairing id)

    Owner->>API: POST /tasks {content, assigneeIds, dueAt}
    API->>DB: create task and assignees (priority = end of queue)
    API-->>Owner: 201 task
    API--)Expo: push "new task" to the assignees' active devices (not awaited)
    Expo--)Worker: notification

    Note over API: RemindersService polls every 15 minutes
    API->>DB: tasks still "new" after 2 h, or due within 2 h, not reminded in the last 2 h
    API--)Expo: push reminder
    API->>DB: set last_reminder_at

    Worker->>API: PATCH /tasks/{id}/ack
    API->>DB: guard re-checks the pairing is not revoked, insert TaskEvent, status = acked
    API-->>Worker: 200 task
```

## Engineering highlights

**Authorization is enforced on the server, in layers.**
A global `JwtAuthGuard` and `RolesGuard` protect every route unless it is explicitly `@Public()`. Role lists
live on the controller methods. Where the rule depends on a relationship rather than a role (for example "the
assignee of this task", "the person measuring this order"), the check is in the service, and a failure is a
`403`, not a hidden button. A dedicated e2e suite calls the API directly with valid tokens of the wrong role
and asserts both the status code and that nothing changed in the database. Order price and deposit are never
selected into task payloads, so a worker cannot receive them even from an endpoint they are allowed to call
(also covered by a test).

**Passwordless device authentication with real revocation.**
The owner generates a short-lived 6-digit pairing code (shown as a QR code; the app also accepts the code typed
by hand). Issuing a new code for the same person immediately invalidates any unused older one. Redeeming
exchanges the code once for a long-lived JWT bound to a `DevicePairing` row. Because a signed JWT alone cannot
be revoked, the guard loads the pairing row on **every request**, so a revoked device loses access on its next
call. Owner tokens (no pairing) carry a `tokenVersion`; `POST /auth/logout-everywhere` increments it and
invalidates all owner tokens without rotating `JWT_SECRET`. Login and redeem are throttled to 10 requests per
minute per IP because a 6-digit code is a small search space.

**Soft delete in the data model.**
`Task` and `Order` have a `deletedAt` column, and the read paths, queues and reminder queries filter on it.
History is preserved: an e2e test soft-deletes a task and asserts it disappears from owner, worker and queue
lists while its `TaskEvent` rows remain. (There is intentionally no delete endpoint yet; see limitations.)

**Double-submit and race protection, enforced in the database.**
Mobile users double-tap, and networks retry. The protections are database-level, not just disabled buttons:

- `TaskEvent` has a unique `(taskId, userId, kind)`; a concurrent second "acknowledge" hits the constraint,
  which is caught and treated as success (test: two simultaneous requests via `Promise.all` produce one event
  and no `500`).
- `Task` has a unique `(orderId, step)`, so two simultaneous "confirm cutting figures" requests, or two
  simultaneous last-step completions, cannot generate duplicate follow-up tasks; the loser's unique violation is
  handled as a normal outcome.
- Claiming a queued cushion step runs in a **Serializable** transaction, so two workers of the same group
  racing for one task produce exactly one winner and a `409` for the other (tested).
- Approve / reject uses `updateMany` with `approval = 'pending'` as the condition.

**Rate limiting, headers, CORS, logging and error handling.**
`@nestjs/throttler` applies a global limit of 120 requests per minute and a stricter limit on the two
unauthenticated endpoints. `helmet` is on; CORS stays off unless `ALLOWED_ORIGINS` is set (a React Native
client is not subject to CORS). Logs are one JSON object per line with timestamp, level, context and a
per-request id carried through `AsyncLocalStorage`. A global exception filter keeps business errors (`4xx`)
as they are and turns unexpected errors into a generic message, while logging the full error and reporting it
to Sentry when `SENTRY_DSN` is set, so stack traces never reach clients. `GET /health` pings the database
through Terminus.

**Prisma migrations.**
The schema evolved through eight committed migrations (`api/prisma/migrations`), mostly additive (new enum
values, nullable columns, a defaulted `approval` column so existing rows kept their meaning). The e2e suite
and CI apply them with `prisma migrate deploy`, so the migration history is exercised, not just the schema file.

**Reminders without extra infrastructure.**
A single in-process job (a 15-minute `setInterval`, no scheduler dependency) pushes a reminder for tasks that
have not been acknowledged after 2 hours or are due within 2 hours (or overdue). `last_reminder_at` and a
2-hour cooldown stop the same task being nagged repeatedly. Tarpaulin tasks that nobody has split yet remind
the coordinator role instead of a person. Push delivery never throws: a failure is logged and the business
operation still succeeds.

**Input validation with explicit limits.**
A global `ValidationPipe` with `whitelist` and `forbidNonWhitelisted` rejects unknown fields instead of
silently dropping them. DTOs set bounds: task text 1-500 characters (200 for self-logged work, whitespace
trimmed first), UUID-checked id arrays, measurements `<= 500`, price and deposit `0..1,000,000,000`, at most 6
photos per order, due dates not in the past, and for self-logged work not more than two years ahead. A custom
validator rejects NUL characters (which PostgreSQL cannot store) with a `400` instead of a `500`. The JSON body
limit is raised to 8 MB deliberately, to fit one compressed base64 measurement photo.

**Offline-friendly mobile behaviour (modest, on purpose).**
The app distinguishes a network failure from an API error and shows a retry banner instead of a generic
failure; the last successful order list is kept in memory so reopening the screen offline still shows data
(cleared on logout so it never leaks to another user); unsent task and order forms are kept as drafts so a
phone call or an OS kill does not lose typing; the session is restored from secure storage on cold start.

**Voice task creation, on the device.**
Speech recognition uses the OS service through `expo-speech-recognition`. A rule-based parser (no LLM, no
external call) extracts the assignee with accent-insensitive fuzzy matching, a due date from phrases such as
"today", "tomorrow" or a weekday, the production line and the raw measurement text. The result is never sent
directly: it always lands on a review screen first.

## Trade-offs and known limitations

This is a working system for a small workshop, not a scaled product. Things a reviewer should know:

- **Reminders run inside the API process.** With more than one API instance each would poll, and duplicates
  are only limited by the cooldown (the "last reminded" write is not atomic with the read). A job queue or a
  single scheduler would be the next step.
- **Photos are stored as base64 data URIs in PostgreSQL** (no object storage), which is why the body limit is
  8 MB and order payloads are heavy. Fine at this volume, wrong at scale.
- **Every authenticated request costs one or two database reads** (user row, plus the pairing row for devices).
  That is the price of immediate revocation and immediate group changes. There is no cache; at workshop scale
  it is cheap.
- **Long-lived tokens (180 days) and no refresh-token flow.** Revocation is handled as described above rather
  than by short expiry.
- **Soft delete has no endpoint.** The column and the filtering exist and are tested, but nothing in the API
  sets `deletedAt` yet.
- **No unit tests; the safety net is end-to-end.** `npm run test` finds no `*.spec.ts` files. The mobile app
  has a TypeScript type check but no automated tests.
- **Push delivery is fire-and-forget.** Expo push receipts are not polled, so dead tokens are not pruned.
- **The in-app feedback form is write-only.** Feedback is stored; there is no screen to read it back.
- **Offline support is limited.** Only the order list is cached (in memory); writes made while offline are
  not queued.
- **Single tenant, Vietnamese UI.** Screens and API error messages are in Vietnamese, and domain values are
  Vietnamese abbreviations (`may_va` = sewing/repair, `bat` = tarpaulin, `dem` = seat cushions, `do` =
  measuring step). Identifiers and this documentation are in English.
- **Mobile `android/` and `ios/` folders are not committed** (generated by `expo prebuild`).

## Data model

Derived from `api/prisma/schema.prisma` (key columns only).

```mermaid
erDiagram
    USER ||--o{ DEVICE_PAIRING : "has devices"
    USER ||--o{ TASK_ASSIGNEE : "is assigned"
    USER ||--o{ TASK : "created"
    USER ||--o{ TASK_EVENT : "reported"
    USER ||--o{ FEEDBACK : "sent"
    USER ||--o{ ORDER : "created"
    TASK ||--o{ TASK_ASSIGNEE : "has"
    TASK ||--o{ TASK_EVENT : "logs"
    ORDER ||--o{ TASK : "generates"
    CUSTOMER ||--o{ ORDER : "places"
    ROUTE |o--o{ CUSTOMER : "last area"
    ROUTE |o--o{ ORDER : "delivery area"

    USER {
        uuid id PK
        string name
        enum role "owner, worker, bat_coordinator"
        enum line "may_va, bat, dem"
        string email "owner only, unique"
        string password "bcrypt hash, owner only"
        int token_version
        enum_array groups "cushion groups"
        bool auto_approve
        string push_token "owner only"
    }
    DEVICE_PAIRING {
        uuid id PK
        uuid user_id FK
        string code UK "6 digits"
        datetime expires_at
        datetime used_at
        datetime revoked_at
        string device_token "Expo push token"
    }
    TASK {
        uuid id PK
        string content
        enum line "may_va, bat, dem"
        enum status "new, acked, in_progress, done"
        enum source "voice, manual, self"
        enum approval "approved, pending, rejected"
        int priority
        datetime due_at
        datetime deleted_at "soft delete"
        datetime last_reminder_at
        uuid order_id FK
        enum step "cushion step, unique with order_id"
    }
    TASK_ASSIGNEE {
        uuid task_id PK
        uuid user_id PK
        uuid assigned_by FK
    }
    TASK_EVENT {
        uuid id PK
        uuid task_id FK
        uuid user_id FK
        enum kind "acked, started, done"
        datetime at "unique with task_id, user_id, kind"
    }
    CUSTOMER {
        uuid id PK
        string name
        string phone "indexed"
        string address
    }
    ROUTE {
        uuid id PK
        string name
        string_array landmarks
        bool active
    }
    ORDER {
        uuid id PK
        enum mode "wholesale, retail"
        enum status "moi, dang_lam, cho_tra, da_tra"
        float measurements "length, depth, width, thickness"
        json pillows
        int price
        int deposit
        datetime due_at
        datetime deleted_at "soft delete"
    }
    FEEDBACK {
        uuid id PK
        uuid user_id FK
        string message
    }
```

## REST API

All routes require `Authorization: Bearer <jwt>` unless marked public. A caller whose role is not listed gets
`403`. "Assignee" means the authenticated user is assigned to that task.

| Method | Path | Who | Purpose |
|---|---|---|---|
| GET | `/health` | public | Liveness + database ping |
| POST | `/auth/login` | public, throttled | Owner email/password login |
| POST | `/auth/pairings` | owner | Issue a 6-digit pairing code for a person |
| POST | `/auth/pairings/redeem` | public, throttled | Exchange a code for a device JWT |
| GET | `/auth/devices` | owner | List paired devices |
| POST | `/auth/devices/:id/revoke` | owner | Revoke a device (effective on its next request) |
| POST | `/auth/logout-everywhere` | owner | Invalidate all owner tokens |
| GET | `/users` | owner | Staff list (`?paired=false` or `?paired=all`) |
| GET | `/users/bat-workers` | owner, coordinator | Active tarpaulin workers |
| PATCH | `/users/:id/groups` | owner | Set cushion groups for a worker |
| PATCH | `/users/:id/auto-approve` | owner | Toggle auto-approval of self-logged work |
| PUT | `/users/me/push-token` | owner | Register the owner's push token |
| POST | `/tasks` | owner | Create and assign a task |
| POST | `/tasks/self` | worker, coordinator | Log work done by oneself |
| GET | `/tasks` | owner | Whole-workshop task list |
| GET | `/tasks/pending` | owner | Self-logged tasks awaiting approval |
| GET | `/tasks/mine` | worker, coordinator | Own tasks |
| GET | `/tasks/bat-queue` | owner, coordinator | Tarpaulin tasks to split |
| GET | `/tasks/dem-queue` | worker | Queued cushion steps for the worker's groups |
| GET | `/tasks/history?range=week\|month` | any role | Completed work, filtered by role |
| GET | `/tasks/:id` | owner, assignee, coordinator (tarpaulin tasks) | Task detail with event log |
| PATCH | `/tasks/reorder` | owner | Reorder priorities from a full id list |
| PATCH | `/tasks/:id/ack` | worker, coordinator (assignee) | Acknowledge |
| PATCH | `/tasks/:id/start` | worker, coordinator (assignee) | Start |
| PATCH | `/tasks/:id/done` | worker, coordinator (assignee) | Finish |
| POST | `/tasks/:id/assign` | owner, coordinator | Split a tarpaulin task among workers (overwrites) |
| POST | `/tasks/:id/claim` | worker (matching group) | Claim a queued cushion step |
| POST | `/tasks/:id/approve` | owner | Approve self-logged work |
| POST | `/tasks/:id/reject` | owner | Reject self-logged work |
| POST | `/orders` | owner | Create an order (and its measuring task) |
| GET | `/orders` | owner | List orders |
| GET | `/orders/:id` | owner | Order detail (includes money) |
| PATCH | `/orders/:id/measurements` | owner, or the worker assigned to measure | Save measurements / photo (locked once cutting is confirmed) |
| POST | `/orders/:id/cut-done` | owner | Confirm cutting figures; generates the parallel steps |
| POST | `/orders/:id/delivered` | owner | Mark delivered and collect the balance |
| GET | `/customers/search?q=` | owner | Find customers and their past measurements |
| GET, POST | `/routes` | owner | List / create delivery areas |
| PATCH | `/routes/:id` | owner | Update a delivery area |
| POST | `/feedback` | any authenticated user | Send feedback |

## Tech stack

| Layer | Technology |
|---|---|
| API framework | NestJS 12, TypeScript (ESM) |
| Database / ORM | PostgreSQL 16, Prisma 7 with the `pg` driver adapter, SQL migrations |
| Auth | JWT (`@nestjs/jwt`), bcrypt (`bcryptjs`), DB-backed device pairing |
| Validation | `class-validator`, `class-transformer` |
| Hardening / ops | `helmet`, `@nestjs/throttler`, `@nestjs/terminus`, Sentry (`@sentry/node`), JSON logger |
| Tests | Vitest + Supertest against a real PostgreSQL |
| Lint / format | oxlint, Prettier |
| Mobile | Expo SDK 57, React Native 0.86, React 19, TypeScript |
| Mobile libraries | React Navigation 7, React Native Paper, `expo-secure-store`, `expo-notifications`, `expo-speech-recognition`, `expo-camera` (QR scan), `expo-image-picker`, `react-native-qrcode-svg` |
| CI | GitHub Actions (API build, lint, tests against a Postgres service; mobile type check) |

## Getting started

Requirements: Node.js 24, npm, Docker (for PostgreSQL), and Expo Go, an emulator or a device for the app.

### 1. Database

```bash
docker compose up -d        # PostgreSQL 16 on localhost:5432 (see docker-compose.yml)
```

### 2. API

```bash
cd api
cp .env.example .env        # edit values as needed
npm ci                      # .npmrc enables legacy-peer-deps
npx prisma generate         # generate the Prisma client (required before build, run and tests)
npx prisma migrate deploy   # apply the 8 migrations
npm run db:seed             # owner account + placeholder workers
npm run start:dev           # http://localhost:3000, health check at /health
```

The seed creates one owner from `OWNER_SEED_EMAIL` / `OWNER_SEED_PASSWORD`, plus placeholder sewing and
tarpaulin workers and a coordinator. Set `OWNER_SEED_PASSWORD` yourself; it is mandatory when
`APP_ENV=production`.

Environment variables (`api/.env.example`):

| Variable | Required | Default / example | Purpose |
|---|---|---|---|
| `DATABASE_URL` | yes | `postgresql://postgres:postgres@localhost:5432/task_manager` | PostgreSQL connection (matches `docker-compose.yml`) |
| `JWT_SECRET` | yes | placeholder | JWT signing secret; use a long random value outside local dev |
| `APP_ENV` | no | `development` | `development` or `production` (Sentry environment; seed safety check) |
| `PORT` | no | `3000` | HTTP port |
| `ALLOWED_ORIGINS` | no | empty | Comma-separated browser origins for CORS; the mobile app does not need it |
| `SENTRY_DSN` | no | empty | Enables Sentry error reporting |
| `EXPO_ACCESS_TOKEN` | no | empty | Authorization for the Expo Push API |
| `PAIRING_CODE_TTL_MIN` | no | `15` | Lifetime of a pairing code, in minutes |
| `OWNER_SEED_EMAIL` | no | `owner@task-manager.local` | Owner email created by the seed |
| `OWNER_SEED_PASSWORD` | production only | placeholder | Owner password created by the seed |

### 3. Mobile app

```bash
cd mobile
cp .env.example .env        # set EXPO_PUBLIC_API_URL
npm ci
npx expo start              # press "a" for an Android emulator, or scan the QR code with Expo Go
```

| Variable | Purpose |
|---|---|
| `EXPO_PUBLIC_API_URL` | API base URL. `http://localhost:3000` works for the web build and the iOS simulator; the Android emulator reaches the host at `http://10.0.2.2:3000`; use your machine's LAN IP on a physical device |
| `EXPO_PUBLIC_POSTHOG_KEY` | Optional PostHog key; leave empty to disable analytics |

Speech recognition and push notifications need a development build rather than Expo Go:

```bash
npx expo prebuild
npx expo run:android        # or: npx expo run:ios
```

To try the whole flow: sign in as the owner in the app, open the screen for adding a new person to the app to
generate a pairing QR, then scan it from a second device or emulator and sign in as that worker.

## Testing

```bash
cd api
npm run lint                # oxlint
npm run build               # nest build
npm run test:e2e            # needs PostgreSQL in DATABASE_URL with migrations applied
cd ../mobile
npm run typecheck           # tsc --noEmit
```

The suite is **7 end-to-end files, 29 tests**. They boot the real `AppModule` against a real PostgreSQL
database and call it over HTTP with Supertest, with no mocked services. Tokens are signed with the same
`JwtService` the app uses, and users are created directly in the database.

| File | Tests | What it covers |
|---|---|---|
| `core-flows` | 2 | Direct assignment (create → ack → start → done, events in order); tarpaulin two-level flow (queue → coordinator splits → worker sees it) |
| `dem-flow` | 6 | Whole cushion order from measuring to delivered; double-submit on "confirm cutting"; two same-group workers racing to claim; measurements locked after cutting; group permissions; money fields never exposed to workers |
| `permissions` | 7 | Wrong-role calls to create / assign / reorder / list-all return `403` and change nothing; coordinator cannot touch the sewing line; a worker sees only their own tasks; missing token returns `401` |
| `self-tasks` | 8 | Self-logged work: pending vs auto-approve, approve / reject state machine (second decision `409`), role rules, NUL character and due-date limits, owner push token, coordinator working sewing and tarpaulin tasks |
| `double-submit` | 2 | Acknowledging twice, sequentially and concurrently, yields one event and no `500` |
| `soft-delete` | 2 | Soft-deleted tasks vanish from owner, worker and queue lists; history rows remain |
| `feedback` | 2 | Authenticated feedback is stored with the right author; unauthenticated gets `401` |

CI (`.github/workflows/ci.yml`) is defined for pushes to `main` and pull requests: the API job runs
`migrate deploy`, build, lint, unit tests (none exist yet) and the e2e suite against a `postgres:16` service,
and the mobile job runs `npm ci` and the type check. On a clean checkout the Prisma client has to be generated
(`npx prisma generate`) before the build and tests, a step the workflow does not have yet (see the roadmap),
so there is no CI badge above.

## Project structure

```
.
├── api/
│   ├── prisma/               schema.prisma, 8 migrations, seed.ts
│   ├── src/
│   │   ├── auth/             owner login, pairing codes, device list/revoke, logout-everywhere
│   │   ├── users/            staff list, cushion groups, auto-approve, owner push token
│   │   ├── tasks/            task lifecycle, queues, approval, history, reminders job
│   │   ├── orders/           seat-cushion orders: measuring, cutting, steps, delivery
│   │   ├── customers/        customer search
│   │   ├── routes/           delivery areas
│   │   ├── notifications/    the only place that calls the Expo Push API
│   │   ├── feedback/         in-app feedback
│   │   ├── health/           database health check
│   │   ├── prisma/           PrismaService (pg driver adapter)
│   │   └── common/           guards, decorators, validators, JSON logger, exception filter
│   └── test/                 7 e2e files + test-app helper
├── mobile/
│   ├── App.tsx, index.ts
│   └── src/
│       ├── navigation/       one navigator per role
│       ├── screens/          28 screens
│       ├── api/              fetch client, shared types
│       ├── auth/             auth context, secure session
│       ├── voice/            utterance parser, fuzzy name matching
│       ├── tasks/ orders/    status helpers, list cache, photo picking
│       ├── notifications/    push token registration
│       └── analytics/ common/ theme/
├── docker-compose.yml        local PostgreSQL 16
├── .github/workflows/ci.yml
└── LICENSE
```

Module-level notes: [`api/README.md`](api/README.md) and [`mobile/README.md`](mobile/README.md).

## Roadmap

- Generate the Prisma client in CI (and as a `postinstall` or `prebuild` step) so a clean checkout builds
  without a manual step; then add a CI badge.
- Add an endpoint and UI for soft delete and restore, and a screen to read feedback.
- Move reminders to a scheduled job that is safe with several API instances.
- Move photos to object storage; poll Expo push receipts and prune dead tokens.
- Unit tests for the pure logic (voice parser, status helpers) and a few mobile component tests.
- Persist the offline cache and queue writes made while offline.

## License and author

Released under the [MIT License](LICENSE).

**Ngo Le Bao Loc** - backend developer
GitHub: [baoloc1993](https://github.com/baoloc1993) | Email: baoloc1993@gmail.com
