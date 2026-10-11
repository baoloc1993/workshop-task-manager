# Mobile app (Expo / React Native)

Phone client of the [Workshop Task Manager](../README.md) for the three roles: owner, coordinator of the
tarpaulin line, and worker. The root README has the architecture and the feature table by role. The UI text is
Vietnamese; code and docs are English.

## Setup

```bash
cp .env.example .env     # EXPO_PUBLIC_API_URL (and optional EXPO_PUBLIC_POSTHOG_KEY)
npm ci
npx expo start           # "a" for an Android emulator, or scan the QR code with Expo Go
```

`EXPO_PUBLIC_API_URL`: `http://localhost:3000` for web / iOS simulator, `http://10.0.2.2:3000` for the Android
emulator, your LAN IP for a physical device. Speech recognition and push notifications need a development build
(`npx expo prebuild`, then `npm run android` or `npm run ios`); `android/` and `ios/` are generated and not
committed.

## Scripts

| Script | Command |
|---|---|
| `npm start` | `expo start` |
| `npm run android` | `expo run:android` (development build) |
| `npm run ios` | `expo run:ios` (development build) |
| `npm run web` | `expo start --web` (layout preview only; real targets are Android and iOS) |
| `npm run typecheck` | `tsc --noEmit` |

There are no automated tests in the app yet; the type check is the gate.

## How the app is organised

`App.tsx` mounts the providers; `src/navigation/RootNavigator.tsx` shows the entry screen (scan a code, or owner
sign-in) when signed out, and otherwise one navigator per role.

| Folder (`src/`) | Contents |
|---|---|
| `navigation/` | `OwnerNavigator`, `BatCoordinatorNavigator`, `WorkerNavigator`, shared header options |
| `screens/` | 28 screens (map below) |
| `api/` | `client.ts` (fetch wrapper, token and profile in `expo-secure-store`, `ApiError` vs `NetworkError`) and `types.ts` |
| `auth/` | `AuthContext`: session restore on cold start, login, pairing, logout |
| `voice/` | `parseUtterance.ts` (rule-based speech to task fields) and `matchAssignees.ts` (accent-insensitive fuzzy names) |
| `tasks/`, `orders/` | Status helpers and chips, in-memory order list cache, photo picker |
| `notifications/` | Push permission, Expo push token, foreground handler |
| `analytics/` | Optional PostHog event capture over HTTP; no-op without a key |
| `common/`, `theme/` | Shared components (error banner, skeleton, keyboard avoider) and design tokens |

## Screens map

| Role | Screens |
|---|---|
| Signed out | `ScanQrScreen` (camera scan, or type the 6-digit code), `OwnerLoginScreen` |
| Owner | `OwnerMenuScreen` and `OwnerHomeScreen` (whole workshop today), `VoiceCaptureScreen` then `CreateTaskScreen` (review before sending), `PriorityScreen`, `TaskDetailScreen`, `BatQueueScreen` and `AssignBatWorkersScreen`, `PendingTasksScreen` (approve self-logged work), `HistoryScreen`, `IssueQrScreen` and `DevicesScreen`, `AssignGroupsScreen`, `OrderListScreen`, `CreateOrderScreen`, `CustomerLookupScreen`, `OrderDetailScreen`, `CutDoneScreen`, `DeliveryScreen`, `RouteSettingsScreen`, `FeedbackScreen` |
| Coordinator | `BatMenuScreen`, `BatQueueScreen`, `AssignBatWorkersScreen`, `MyTasksScreen`, `SelfTaskScreen`, `TaskDetailScreen`, `HistoryScreen`, `FeedbackScreen` |
| Worker | `WorkerMenuScreen`, `MyTasksScreen`, `SelfTaskScreen` (not for cushion workers), `DemQueueScreen` (group queue, cushion workers), `TaskDetailScreen` (also the measuring form), `HistoryScreen`, `FeedbackScreen` |

## Behaviour worth knowing

- The JWT and a small profile (id, name, role, groups) are stored in `expo-secure-store`; the web build falls
  back to `localStorage` for layout preview only.
- Network failures are shown with a retry banner, distinct from API errors. The order list is cached in memory
  and cleared on logout; unsent task and order forms are kept as drafts. Nothing is queued for later sending.
- Push registration is best-effort: if permission is denied or the device cannot get a token, pairing and the
  rest of the app still work.
- Voice input never creates a task directly; the parsed result is shown for review first.
