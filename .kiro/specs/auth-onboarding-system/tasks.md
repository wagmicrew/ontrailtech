# Implementation Plan: Auth + Onboarding System

## Overview

Replace Privy-based authentication with a fully self-hosted auth system. Backend: FastAPI + PostgreSQL + Redis. Frontend: React + TypeScript. Five auth methods, JWT tokens with Redis refresh, 6-step onboarding wizard, and full Privy SDK removal.

## Tasks

- [x] 1. Database migration and model updates
  - [x] 1.1 Update User model in `services/api/models.py`
    - Add columns: `password_hash` (String 255, nullable), `avatar_url` (String 500, nullable), `google_id` (String 255, unique, nullable), `onboarding_completed` (Boolean, default False)
    - Make `username` nullable (set during onboarding), make `wallet_address` nullable (email-only users)
    - Add unique constraint on `email`
    - _Requirements: 1.1, 1.5, 5.2, 9.3, 10.4, 13.3_

  - [x] 1.2 Update Wallet model in `services/api/models.py`
    - Add `encrypted_private_key` (Text, nullable) column
    - Add unique constraint on `wallet_address`
    - _Requirements: 10.2, 10.4, 11.2_

  - [x] 1.3 Create Alembic migration for schema changes
    - Single migration file in `services/api/alembic/versions/` adding all new columns and constraints
    - _Requirements: 1.1, 10.2_

- [x] 2. Backend config and new service modules
  - [x] 2.1 Extend `services/api/config.py` with new settings
    - Add: `google_client_id`, `smtp_host`, `smtp_port`, `smtp_user`, `smtp_password`, `smtp_from`, `wallet_encryption_key`, `siwe_domain`
    - _Requirements: 5.1, 10.2, 3.1_

  - [x] 2.2 Create `services/api/token_manager.py`
    - Implement `TokenManager` class with methods: `create_access_token` (HS256, 30-day TTL, payload: sub, email, role, wallet_address), `create_refresh_token` (UUID stored in Redis with 30-day TTL), `verify_refresh_token`, `revoke_refresh_token`, `revoke_all_user_tokens`
    - Use existing `redis_client.py` Redis connection
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 2.3 Create `services/api/otp_service.py`
    - Implement `OTPService` class with methods: `generate_otp` (6-digit code, DEL previous, SETEX 15min TTL in Redis), `verify_otp` (check code + purpose, DEL on success for single-use)
    - Redis key format: `otp:{email}` → JSON `{"code": "123456", "purpose": "login"|"reset"}`
    - _Requirements: 3.1, 3.2, 3.5, 3.6_

  - [x] 2.4 Create `services/api/wallet_service.py`
    - Implement `WalletService` class with methods: `generate_wallet` (ETH keypair via eth_account), `encrypt_private_key` (AES-256-GCM using WALLET_ENCRYPTION_KEY env var), `decrypt_private_key`
    - _Requirements: 10.1, 10.2_

  - [x] 2.5 Add rate limit helpers for OTP and registration
    - Add `rate_limit_otp(email)` (3 req/min per email) and `rate_limit_register(request)` (5 req/min per IP) to `services/api/rate_limit.py`
    - Ensure 429 responses include `Retry-After` header
    - _Requirements: 16.1, 16.2, 16.3_

- [x] 3. Checkpoint — Ensure models, config, and services are wired correctly
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Auth router full rewrite (`services/api/routers/auth.py`)
  - [x] 4.1 Implement email+password registration endpoint
    - `POST /auth/register` — validate password (8+ chars, upper, lower, digit), normalize email to lowercase, check uniqueness, bcrypt hash (10 rounds), create user, issue tokens via TokenManager
    - Return unified `AuthResponse` with `{access_token, refresh_token, user}`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [x] 4.2 Implement email+password login endpoint
    - `POST /auth/login` — normalize email, lookup user, bcrypt verify, return identical 401 "Invalid credentials" for both wrong password and non-existent email (anti-enumeration)
    - Apply `rate_limit_auth` (5 req/min per IP)
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 4.3 Implement OTP request and verify endpoints
    - `POST /auth/request-otp` — generate OTP via OTPService, send email, always return 200 (anti-enumeration)
    - `POST /auth/verify-otp` — verify code + purpose, auto-create user if new email (purpose="login"), reset password if purpose="reset" with new_password field
    - Apply `rate_limit_otp` (3 req/min per email)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x] 4.4 Implement forgot-password endpoint
    - `POST /auth/forgot-password` — always return 200 OK regardless of email existence, generate reset OTP only if email exists
    - Apply `rate_limit_otp` (3 req/min per email)
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [x] 4.5 Implement Google OAuth endpoint
    - `POST /auth/google` — verify ID token via Google tokeninfo endpoint (httpx), extract email + google_id, find-or-create user, issue tokens
    - Return 401 "Invalid Google token" on verification failure
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 4.6 Implement SIWE challenge and wallet auth endpoints
    - `POST /auth/challenge` — generate SIWE-compliant message with nonce, domain `ontrail.tech`, store nonce in `auth_nonces` table
    - `POST /auth/wallet` — recover signer from signature, verify match, mark nonce used, find-or-create user by wallet, issue tokens
    - Return 401 "Invalid signature" on mismatch, 401 "Invalid or expired nonce" on replay
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x] 4.7 Implement token refresh and logout endpoints
    - `POST /auth/refresh` — verify refresh token in Redis via TokenManager, issue new access token
    - `POST /auth/logout` — revoke refresh token from Redis
    - _Requirements: 7.3, 7.4, 7.5_

  - [x] 4.8 Implement connect external wallet endpoint
    - `POST /auth/connect/wallet` — verify SIWE signature, check wallet not already linked to another user (409 if so), store wallet with `wallet_type="external"`
    - _Requirements: 11.2, 11.4_

  - [ ]* 4.9 Write property tests for auth endpoints
    - **Property 1: Registration → Login Round-Trip**
    - **Property 2: Duplicate Email Rejection**
    - **Property 3: Password Validation**
    - **Property 4: Email Case Normalization**
    - **Property 5: Login Anti-Enumeration**
    - **Property 6: OTP Format**
    - **Property 7: OTP Invalidation on Re-Request**
    - **Property 8: OTP Auto-Registration**
    - **Property 9: OTP Single-Use**
    - **Property 10: Forgot-Password Anti-Enumeration**
    - **Property 11: Password Reset Round-Trip**
    - **Property 12: SIWE Challenge Format**
    - **Property 13: SIWE Auth Round-Trip**
    - **Property 14: SIWE Invalid Signature Rejection**
    - **Property 15: SIWE Nonce Replay Prevention**
    - **Property 16: JWT Payload Correctness**
    - **Property 17: Refresh Token Redis Storage**
    - **Property 18: Token Refresh Round-Trip**
    - **Property 19: Logout Revokes Refresh Token**
    - **Property 32: Rate Limiting**
    - **Validates: Requirements 1.1–7.7, 16.1–16.3**

- [x] 5. Checkpoint — Backend auth endpoints complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Update users and onboarding routers
  - [x] 6.1 Add `GET /users/me` endpoint to `services/api/routers/users.py`
    - Return authenticated user profile: id, username, email, wallet_address, avatar_url, reputation_score, roles (via `get_user_roles`), onboarding_completed
    - Use `get_current_user` dependency; return 401 if unauthenticated
    - _Requirements: 17.1, 17.2_

  - [x] 6.2 Add `POST /users/me/avatar` endpoint to `services/api/routers/users.py`
    - Accept `avatar_url` string, update user record
    - _Requirements: 9.3_

  - [x] 6.3 Add `POST /users/me/change-password` endpoint to `services/api/routers/users.py`
    - Verify current password via bcrypt, validate new password (same rules: 8+ chars, upper, lower, digit), hash and update
    - Return 401 "Current password is incorrect" on wrong current password
    - _Requirements: 18.1, 18.2, 18.3_

  - [x] 6.4 Rewrite `services/api/routers/onboarding.py` — remove Privy dependency
    - Replace `POST /onboarding/register` (remove `privy_auth` import and `verify_privy_token` call)
    - Add `POST /onboarding/create-wallet` — generate profile wallet via WalletService, encrypt key, store in wallets table, update user.wallet_address
    - Add `POST /onboarding/auto-follow` — create friend rows for Ancient_Owner and Founders_DAO, record ReputationEvent with event_type="signup", skip missing accounts gracefully
    - Add `POST /onboarding/complete` — set user.onboarding_completed=true
    - _Requirements: 10.1, 10.2, 10.4, 10.5, 12.1, 12.2, 12.3, 13.3_

  - [x] 6.5 Update `services/api/routers/identity.py` — add "auth" to reserved words
    - Add "auth" to `RESERVED_WORDS` set, update username pattern to allow underscores per requirements (3-20 chars, alphanumeric + underscores)
    - _Requirements: 8.3, 8.4_

  - [ ]* 6.6 Write property tests for users/onboarding endpoints
    - **Property 21: Runner Name Validation**
    - **Property 22: Runner Name Claim Persistence**
    - **Property 23: Avatar Save Round-Trip**
    - **Property 24: Profile Wallet Creation Round-Trip**
    - **Property 25: External Wallet Link**
    - **Property 26: Duplicate External Wallet Rejection**
    - **Property 27: Auto-Follow and Reputation Event**
    - **Property 28: Onboarding Completion**
    - **Property 33: GET /users/me Auth Gate**
    - **Property 34: Change Password Round-Trip**
    - **Validates: Requirements 8.3–12.3, 13.3, 17.1–18.3**

- [x] 7. Checkpoint — All backend endpoints complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Frontend API layer update (`apps/web/src/lib/api.ts`)
  - [x] 8.1 Add 401 interceptor with automatic token refresh
    - Wrap the existing `request()` function: on 401 response, attempt `POST /auth/refresh` with stored refresh token, retry original request on success, clear tokens and redirect on failure
    - Store tokens under keys `ontrail_token` (access) and `ontrail_refresh_token` (refresh) in localStorage
    - _Requirements: 7.6, 7.7, 15.3_

  - [x] 8.2 Add all new auth API methods to the `api` object
    - `authRegister(email, password)`, `authLogin(email, password)`, `authRequestOTP(email)`, `authVerifyOTP(email, code, purpose?)`, `authForgotPassword(email)`, `authGoogle(idToken)`, `authChallenge(walletAddress)`, `authWallet(walletAddress, sig, msg)`, `authRefresh(refreshToken)`, `authLogout(refreshToken)`, `authConnectWallet(wallet, sig, msg)`
    - `getMe()`, `updateAvatar(avatarUrl)`, `changePassword(current, newPw)`
    - `createProfileWallet()`, `autoFollow()`, `completeOnboarding()`
    - Remove old `onboardingRegister` method that uses Privy token
    - _Requirements: 15.3, 15.6_

- [x] 9. AuthContext full replacement (`apps/web/src/context/AuthContext.tsx`)
  - [x] 9.1 Rewrite AuthContext — remove all Privy imports and hooks
    - Remove `usePrivy` import and all Privy-related logic
    - Implement new `AuthState` interface: `isConnected`, `isLoading`, `wallet`, `userId`, `username`, `email`, `roles`, `isAdmin`, `isAncientOwner`, `avatarUrl`, `onboardingCompleted`, `login()`, `logout()`, `loginWithWallet()`
    - On mount: check localStorage for access_token → call `getMe()` to hydrate state → on 401 attempt refresh → on failure clear tokens
    - `login()` opens AuthModal, `logout()` calls `POST /auth/logout` + clears localStorage + resets state
    - `loginWithWallet()` opens AuthModal on wallet tab
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6_

  - [ ]* 9.2 Write property tests for AuthContext
    - **Property 20: HTTP Interceptor Token Attachment and Refresh**
    - **Property 30: AuthContext Initialization from localStorage**
    - **Property 31: AuthContext Logout Clears State**
    - **Validates: Requirements 7.6, 7.7, 15.2, 15.5**

- [x] 10. Auth Modal component (`apps/web/src/components/AuthModal.tsx`)
  - [x] 10.1 Create AuthModal with three tabs: Email, Google, Wallet
    - Centered overlay with `backdrop-blur-xl bg-black/50`, card `bg-white rounded-2xl shadow-2xl max-w-md`
    - Tabs with emerald active indicator (`bg-emerald-500 text-white`)
    - Use `framer-motion` `AnimatePresence` for tab/mode transitions
    - Email tab: login form, register toggle, "Forgot Password?" link, OTP mode
    - Google tab: "Continue with Google" button triggering OAuth popup
    - Wallet tab: ConnectKit button triggering SIWE flow
    - Internal state machine: `tab` (email|google|wallet), `emailMode` (login|register|otp|forgot-password|reset-password)
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6_

- [x] 11. OTP Input component (`apps/web/src/components/OTPInput.tsx`)
  - [x] 11.1 Create accessible 6-digit OTP input component
    - 6 individual digit inputs with auto-focus advancement on entry
    - Backspace moves to previous input
    - Paste support: split pasted string across all 6 inputs
    - `aria-label` per digit for accessibility
    - Props: `length` (default 6), `onComplete(code)`, `disabled`, `error`
    - _Requirements: 14.7_

  - [ ]* 11.2 Write property test for OTP paste
    - **Property 29: OTP Input Paste Support**
    - **Validates: Requirements 14.7**

- [x] 12. Onboarding Wizard component (`apps/web/src/components/OnboardingWizard.tsx`)
  - [x] 12.1 Create 6-step OnboardingWizard component
    - Step 1 — Runner Name: text input + debounced (300ms) availability check via `GET /identity/check/{username}`, real-time feedback, claim via `POST /identity/claim`
    - Step 2 — Avatar: grid of 12 preset avatars, save via `POST /users/me/avatar`
    - Step 3 — Profile Wallet: auto-generate via `POST /onboarding/create-wallet`, display address
    - Step 4 — External Wallet (optional): ConnectKit button OR "Skip" button, link via `POST /auth/connect/wallet`
    - Step 5 — Auto-Follow: call `POST /onboarding/auto-follow`, show progress
    - Step 6 — Welcome: display runner name + avatar + wallet, CTA "Start Exploring" → call `POST /onboarding/complete`
    - Linear progression, only step 4 is skippable
    - _Requirements: 8.1, 8.2, 8.3, 8.5, 9.1, 9.2, 9.3, 10.3, 11.1, 11.2, 11.3, 12.1, 13.1, 13.2, 13.3_

- [x] 13. Privy SDK removal and wiring
  - [x] 13.1 Remove Privy from `apps/web/src/main.tsx`
    - Remove `PrivyProvider` wrapper and `@privy-io/react-auth` import
    - Keep `WagmiProvider`, `ConnectKitProvider`, `QueryClientProvider`, `AuthProvider`, `BrowserRouter`
    - Remove `PRIVY_APP_ID` constant
    - _Requirements: 19.2_

  - [x] 13.2 Remove `@privy-io/react-auth` from `apps/web/package.json`
    - Remove the package from dependencies
    - _Requirements: 19.1_

  - [x] 13.3 Remove Privy environment variables
    - Remove `VITE_PRIVY_APP_ID` from `apps/web/.env` and `apps/web/.env.example`
    - _Requirements: 19.4_

  - [x] 13.4 Replace all `usePrivy()` calls with `useAuth()` across the codebase
    - Search all files importing from `@privy-io/react-auth` and replace with `useAuth` from `../context/AuthContext`
    - Remove `privy_auth.py` import from `services/api/routers/onboarding.py`
    - _Requirements: 19.3_

  - [x] 13.5 Wire AuthModal into AuthContext
    - AuthContext `login()` and `loginWithWallet()` should control AuthModal open state
    - Render AuthModal at the provider level so it's available app-wide
    - Conditionally render OnboardingWizard when `isConnected && !onboardingCompleted`
    - _Requirements: 15.4, 8.1, 13.2_

- [x] 14. Final checkpoint — Full integration verification
  - Ensure all tests pass, ask the user if questions arise.
  - Verify: register with email → login → refresh → logout works end-to-end
  - Verify: OTP flow, Google OAuth, SIWE wallet flow all return unified AuthResponse
  - Verify: onboarding wizard completes all 6 steps
  - Verify: no Privy imports remain in the codebase

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- The user tests on the server, not locally — skip test-only standalone tasks
