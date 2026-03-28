# Implementation Plan: Expo Companion App

## Overview

Incremental implementation of the OnTrail Expo companion app, starting with core library modules (API client, auth, offline queue), then mobile screens and navigation, followed by backend endpoints, web integrations (QR footer, admin panel), and infrastructure config. Each task builds on previous steps. Property-based tests use fast-check with Vitest.

## Tasks

- [x] 1. Set up project dependencies and core types
  - Install required packages in `apps/mobile`: `expo-secure-store`, `expo-sensors`, `expo-apple-authentication`, `expo-auth-session`, `expo-notifications`, `@react-native-async-storage/async-storage`, `@react-native-community/netinfo`, `react-native-health`, `react-native-google-fit`, `react-native-maps`, `qrcode.react` (web)
  - Create `apps/mobile/lib/types.ts` with shared interfaces: `TokenPair`, `AuthResponse`, `AuthUser`, `RunnerProfile`, `POI`, `StepSyncPayload`, `HealthSyncPayload`, `GPSPosition`, `VerifyResult`, `CheckinPayload`, `QueuedRequest`, `ProfileUpdate`
  - Create `apps/mobile/lib/constants.ts` with `API_BASE_URL`, storage keys, sync intervals, distance thresholds
  - _Requirements: 1.1, 7.3, 11.3_

- [x] 2. Implement API Client
  - [x] 2.1 Create `apps/mobile/lib/apiClient.ts`
    - Implement `request<T>()` with HTTPS base URL, JSON headers, Bearer token attachment from SecureStore
    - Implement 401 → refresh → retry → `onSessionExpired` flow
    - Attach `X-Device-Attestation` header on all requests
    - Implement all typed API methods (auth, profile, POI, steps, health, push)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [ ]* 2.2 Write property test: API client HTTPS base URL and JSON headers
    - **Property 1: API client uses HTTPS base URL with JSON headers**
    - **Validates: Requirements 1.1, 1.5**

  - [ ]* 2.3 Write property test: Bearer token attachment
    - **Property 2: Bearer token attachment on authenticated requests**
    - **Validates: Requirements 1.2**

  - [ ]* 2.4 Write property test: 401 triggers refresh-then-retry
    - **Property 3: 401 triggers refresh-then-retry**
    - **Validates: Requirements 1.3**

  - [ ]* 2.5 Write property test: Failed refresh clears token storage
    - **Property 4: Failed refresh clears token storage**
    - **Validates: Requirements 1.4, 6.4**

- [x] 3. Implement Auth Manager
  - [x] 3.1 Create `apps/mobile/lib/authManager.ts`
    - Implement `getTokenPair()`, `storeTokenPair()`, `clearTokenPair()` using `expo-secure-store`
    - Implement `validateSession()` — read stored pair, call `GET /users/me`, attempt refresh on 401, clear on failure
    - Implement `loginWithOtp(email, code)` — call `/auth/request-otp` then `/auth/verify-otp`, store tokens
    - Implement `loginWithGoogle()` — use `expo-auth-session` to get id_token, call `/auth/google`
    - Implement `loginWithApple()` — use `expo-apple-authentication` to get identity token, call `/auth/apple`
    - Implement `loginWithWallet()` — ConnectKit modal → `/auth/challenge` → sign → `/auth/wallet`
    - Implement `logout()` — call `/auth/logout`, clear SecureStore regardless of API result
    - _Requirements: 2.1, 2.3, 2.4, 3.1, 3.2, 3.3, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.3, 6.4, 6.5_

  - [ ]* 3.2 Write property test: Token storage round trip
    - **Property 5: Token storage round trip**
    - **Validates: Requirements 2.4, 3.3, 4.4, 5.5, 6.1**

  - [ ]* 3.3 Write property test: Auth method routes to correct endpoint
    - **Property 6: Auth method routes to correct endpoint with correct payload**
    - **Validates: Requirements 2.1, 2.3, 3.2, 4.3, 5.2, 5.4**

  - [ ]* 3.4 Write property test: Logout clears all stored tokens
    - **Property 7: Logout clears all stored tokens**
    - **Validates: Requirements 6.5**

- [x] 4. Checkpoint — Core client and auth
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement Offline Queue
  - [x] 5.1 Create `apps/mobile/lib/offlineQueue.ts`
    - Implement `enqueue()` — persist to AsyncStorage under `@ontrail/offline_queue`, append to FIFO array
    - Implement `processQueue()` — on connectivity restore (NetInfo listener), replay in createdAt order
    - Implement retry logic: up to 3 retries with exponential backoff (1s, 2s, 4s), discard after 3 failures with user notification
    - Implement `getQueueSize()` for UI display
    - _Requirements: 13.3, 13.4, 13.5_

  - [ ]* 5.2 Write property test: Offline requests are enqueued
    - **Property 20: Offline requests are enqueued**
    - **Validates: Requirements 13.3**

  - [ ]* 5.3 Write property test: Offline queue FIFO order
    - **Property 21: Offline queue processes in FIFO order**
    - **Validates: Requirements 13.4**

  - [ ]* 5.4 Write property test: Offline queue retries with exponential backoff
    - **Property 22: Offline queue retries with exponential backoff**
    - **Validates: Requirements 13.5**

- [x] 6. Implement Device Attestation
  - [x] 6.1 Create `apps/mobile/lib/deviceAttestation.ts`
    - Implement `isAvailable()` — check platform (iOS → App Attest, Android → Play Integrity)
    - Implement `getAttestationToken()` — return token string or `null` on failure
    - Integrate with apiClient: attach `X-Device-Attestation` header (`token` or `none`)
    - _Requirements: 15.1, 15.2, 15.3, 15.4_

  - [ ]* 6.2 Write property test: Attestation header on sensitive requests
    - **Property 24: Attestation header on sensitive requests**
    - **Validates: Requirements 15.1**

  - [ ]* 6.3 Write property test: Attestation failure does not block requests
    - **Property 25: Attestation failure does not block requests**
    - **Validates: Requirements 15.4**

- [x] 7. Implement Step Tracker
  - [x] 7.1 Create `apps/mobile/lib/stepTracker.ts`
    - Implement `isAvailable()` and `requestPermission()` using `expo-sensors` Pedometer API
    - Implement `startTracking()` / `stopTracking()` with configurable sync interval (default 15 min, bounded 5–30 min)
    - Implement `getCurrentDaySteps()` and `getStepsSince(date)`
    - On foreground resume, query pedometer for background gap and sync immediately
    - If no pedometer sensor, surface unavailability flag for UI
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [ ]* 7.2 Write property test: Step sync interval bounds
    - **Property 8: Step sync interval is bounded between 5 and 30 minutes**
    - **Validates: Requirements 7.3**

- [x] 8. Implement Health Sync
  - [x] 8.1 Create `apps/mobile/lib/healthSync.ts`
    - Implement `isAvailable()` and `requestPermissions()` — platform-specific (react-native-health / react-native-google-fit)
    - Implement `readTodayData()` — read steps, distance, calories for current day
    - Implement `sync()` — submit to `POST /health/sync` once per hour while foregrounded
    - If permissions denied, continue with pedometer-only and show settings prompt
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [ ]* 8.2 Write property test: Health sync interval
    - **Property 9: Health sync interval is approximately 1 hour**
    - **Validates: Requirements 8.4**

- [x] 9. Implement GPS Verifier
  - [x] 9.1 Create `apps/mobile/lib/gpsVerifier.ts`
    - Implement `getCurrentPosition(highAccuracy)` using `expo-location` with `Accuracy.High`
    - Implement `calculateDistance(a, b)` using Haversine formula (returns meters)
    - Implement `verifyProximity(userPos, poiPos, maxDistance)` — returns `{ allowed, distance, accuracyWarning }`
    - Proximity gate: allowed if distance ≤ 200m, warning if accuracy > 100m
    - Build `CheckinPayload` with POI ID, coordinates, accuracy, timestamp, optional attestation token
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_

  - [ ]* 9.2 Write property test: Haversine distance calculation
    - **Property 14: Haversine distance calculation**
    - **Validates: Requirements 11.2**

  - [ ]* 9.3 Write property test: Proximity gate for POI check-in
    - **Property 15: Proximity gate for POI check-in**
    - **Validates: Requirements 11.3, 11.4**

  - [ ]* 9.4 Write property test: Check-in payload includes GPS accuracy
    - **Property 16: Check-in payload always includes GPS accuracy**
    - **Validates: Requirements 11.5**

  - [ ]* 9.5 Write property test: GPS accuracy warning threshold
    - **Property 17: GPS accuracy warning threshold**
    - **Validates: Requirements 11.6**

- [x] 10. Checkpoint — All mobile lib modules
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Implement Navigation and Screens
  - [x] 11.1 Create root layout and navigation structure
    - Create `apps/mobile/app/_layout.tsx` — root layout that checks SecureStore for valid token pair on mount
    - Create `apps/mobile/app/(auth)/login.tsx` — login screen with OTP email input, Google, Apple (iOS only), and wallet buttons
    - Create `apps/mobile/app/(auth)/_layout.tsx` — auth group layout
    - Create `apps/mobile/app/(tabs)/_layout.tsx` — bottom tab navigator with Home, Explore, Profile, Settings tabs
    - If authenticated → render tabs; if not → render auth group
    - _Requirements: 12.1, 12.6, 2.1, 2.2, 2.5, 3.1, 3.4, 4.1, 4.2, 4.5, 5.1, 5.6_

  - [ ]* 11.2 Write property test: Unauthenticated state hides tab navigator
    - **Property 18: Unauthenticated state hides tab navigator**
    - **Validates: Requirements 12.6**

  - [x] 11.3 Create Home screen
    - Create `apps/mobile/app/(tabs)/index.tsx` — display daily step count, recent activity summary, quick-access cards for nearby POIs and active routes
    - Show "Step counting unavailable" message if no pedometer
    - Show offline banner when no connectivity, serve cached data
    - _Requirements: 12.2, 7.5, 7.6, 13.1, 13.2_

  - [x] 11.4 Create Explore screen
    - Create `apps/mobile/app/(tabs)/explore.tsx` — map view centered on user GPS using react-native-maps
    - On load/pan, call `GET /poi/nearby` with map center + 10km radius
    - Render POI markers with rarity colors (common: gray, rare: blue, epic: purple, legendary: gold)
    - Tap marker → detail card (name, rarity, distance, description)
    - Mint POI button → `POST /poi/mint` with GPS coords
    - Check-in button → GPS proximity verification → `POST /route/checkin`
    - If GPS unavailable, show "Enable location services" prompt
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 11.1, 11.3, 11.4, 11.6_

  - [ ]* 11.5 Write property test: POI nearby query uses map center coordinates
    - **Property 12: POI nearby query uses map center coordinates**
    - **Validates: Requirements 10.2**

  - [ ]* 11.6 Write property test: Rarity-to-color mapping
    - **Property 13: Rarity-to-color mapping is deterministic and complete**
    - **Validates: Requirements 10.3**

  - [x] 11.7 Create Profile screen
    - Create `apps/mobile/app/(tabs)/profile.tsx` — display username, avatar, bio, reputation, rank, aura, step balance, FriendPass stats, supporter count
    - Edit profile button → form with username, email, bio, location, preferred_reward_wallet → `PATCH /users/me/profile`
    - Change avatar → image picker → `POST /users/me/media/profile-image`
    - Display synced health metrics (steps, distance, calories)
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 8.6_

  - [ ]* 11.8 Write property test: Runner profile renders all required fields
    - **Property 10: Runner profile rendering includes all required fields**
    - **Validates: Requirements 9.1, 9.5, 9.6**

  - [ ]* 11.9 Write property test: Profile update sends correct payload
    - **Property 11: Profile update sends correct payload**
    - **Validates: Requirements 9.3**

  - [x] 11.10 Create Settings screen
    - Create `apps/mobile/app/(tabs)/settings.tsx` — logout button, health sync permissions toggle, notification preferences toggle, app version info
    - Logout → call `authManager.logout()` → navigate to login
    - Push notification toggle → register/unregister device token
    - _Requirements: 12.5, 6.5, 14.4, 14.5_

- [x] 12. Implement Push Notifications
  - [x] 12.1 Create `apps/mobile/lib/pushNotifications.ts`
    - On first login, request push permission and register token via `POST /users/me/device-token`
    - Handle foreground notifications with in-app banner
    - Handle notification tap → deep-link to screen based on payload (`profile`, `explore`, `home`; default to `home`)
    - Unregister via `DELETE /users/me/device-token` when disabled in settings
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5_

  - [ ]* 12.2 Write property test: Push notification deep-link routing
    - **Property 23: Push notification deep-link routing**
    - **Validates: Requirements 14.3**

- [x] 13. Implement Local Caching
  - [x] 13.1 Add caching layer to API client
    - Cache runner profile to `@ontrail/cached_profile` in AsyncStorage after fetch
    - Cache nearby POI list to `@ontrail/cached_pois` after fetch
    - Cache current day step count to `@ontrail/cached_steps`
    - Serve cached data when offline, show offline banner via NetInfo
    - Integrate offline queue: enqueue step syncs and check-ins when offline
    - _Requirements: 13.1, 13.2, 13.3_

  - [ ]* 13.2 Write property test: Cache round trip for profile and POI data
    - **Property 19: Cache round trip for profile and POI data**
    - **Validates: Requirements 13.1**

- [x] 14. Checkpoint — Mobile app complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 15. Backend: New API endpoints
  - [x] 15.1 Create steps and health sync endpoints
    - Add `POST /steps/sync` to `services/api/routers/` — accept `{ steps, period_start, period_end, source }`, require auth, read `X-Device-Attestation` header, return `{ message, daily_total }`
    - Add `POST /health/sync` to `services/api/routers/` — accept `{ steps, distance_meters, calories_burned, period_start, period_end, source }`, require auth, read `X-Device-Attestation` header
    - _Requirements: 7.3, 8.3, 15.1_

  - [x] 15.2 Create Apple auth endpoint
    - Add `POST /auth/apple` to `services/api/routers/` — accept `{ identity_token }`, verify with Apple, return `AuthResponse` (same shape as Google/OTP flows)
    - _Requirements: 4.3, 4.4_

  - [x] 15.3 Create device token endpoints
    - Add `POST /users/me/device-token` — accept `{ token, platform }`, store for push notifications
    - Add `DELETE /users/me/device-token` — remove stored device token
    - _Requirements: 14.1, 14.5_

  - [x] 15.4 Create Expo Go admin endpoints
    - Add `GET /admin/expo/status` — return `{ status, port, uptime, memory_mb, pid }` from PM2 process info
    - Add `POST /admin/expo/restart` — restart `ontrail-expo` PM2 process (or start if stopped), return new status
    - Add `PUT /admin/expo/port` — validate port 1024–65535, update PM2 config, restart process
    - Add `GET /admin/expo/logs` — return last 50 lines from PM2 log file
    - Add `GET /admin/expo/sessions` — return count and details of active WebSocket connections
    - All endpoints require admin auth via `require_admin` dependency
    - _Requirements: 18.4, 18.5, 18.6, 18.7, 18.8, 18.9_

  - [ ]* 15.5 Write property test: Expo status endpoint returns all required fields
    - **Property 26: Expo status endpoint returns all required fields**
    - **Validates: Requirements 17.2, 18.4**

  - [ ]* 15.6 Write property test: Expo logs endpoint returns at most 50 lines
    - **Property 27: Expo logs endpoint returns at most 50 lines**
    - **Validates: Requirements 18.7**

- [x] 16. Checkpoint — Backend endpoints
  - Ensure all tests pass, ask the user if questions arise.

- [x] 17. Web: QR Code in Layout Footer
  - [x] 17.1 Add QR code to `apps/web/src/components/Layout.tsx` footer
    - Install `qrcode.react` in `apps/web`
    - Render QR code SVG encoding `https://expo.ontrail.tech` at 120×120px minimum in the desktop footer
    - Add label "Try the mobile app" with URL `expo.ontrail.tech`
    - Hide QR code below 768px viewport width
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5_

- [x] 18. Web: ExpoGoPage Admin Panel
  - [x] 18.1 Create `apps/web/src/pages/admin/ExpoGoPage.tsx`
    - Display server status (running/stopped/errored), port, uptime, memory from `GET /admin/expo/status`
    - Restart button → `POST /admin/expo/restart` with confirmation message
    - Port configuration form → `PUT /admin/expo/port` with client-side validation (1024–65535)
    - Display last 50 log lines from `GET /admin/expo/logs`
    - Display active sessions count from `GET /admin/expo/sessions`
    - Show error state if status endpoint fails
    - _Requirements: 17.2, 17.3, 17.4, 17.5, 17.6, 17.7_

  - [x] 18.2 Add "Expo Go" nav item to Admin sidebar
    - Update `apps/web/src/pages/Admin.tsx` — add `expo` section to `AdminSection` type and `NAV` array, render `ExpoGoPage` component
    - _Requirements: 17.1_

- [x] 19. Infrastructure Configuration
  - [x] 19.1 Add PM2 ecosystem entry for Expo
    - Add `ontrail-expo` entry to `infra/pm2/ecosystem.config.js` — `cwd: './apps/mobile'`, `script: 'npx'`, `args: 'expo start --port 8081 --tunnel'`, `interpreter: 'none'`
    - _Requirements: 18.1_

  - [x] 19.2 Add Nginx server block for expo.ontrail.tech
    - Add server block to `infra/nginx/ontrail-tech.conf` — listen 443 ssl http2, proxy to 127.0.0.1:8081, WebSocket upgrade headers for live reload/HMR
    - _Requirements: 18.2, 18.10_

  - [x] 19.3 Add DNS A record for expo subdomain
    - Add `expo IN A 85.208.51.194` to `infra/dns/ontrail.tech.zone`, increment serial
    - _Requirements: 18.3_

- [x] 20. Final checkpoint — Full integration
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests use fast-check with Vitest, minimum 100 iterations per property
- The design uses TypeScript for all mobile and web code, Python for backend endpoints
