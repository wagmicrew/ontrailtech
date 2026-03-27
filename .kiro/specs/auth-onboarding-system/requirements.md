# Requirements Document

## Introduction

The Auth + Onboarding System replaces the current Privy-based authentication in OnTrail with a custom, self-hosted authentication system modeled after the Loppio PRD pattern. The system provides five authentication methods (email+password, OTP passwordless, forgot-password OTP, Google OAuth, and WalletConnect/SIWE), a JWT token system with Redis-backed refresh token revocation, and a multi-step onboarding wizard for new users (runner name → avatar → profile wallet → optional external wallet → auto-follow → welcome). The frontend removes all Privy SDK dependencies and introduces a beautiful auth modal and onboarding flow matching the OnTrail visual design language (emerald/green primary, dark hero sections, Inter font, flowing animations). The backend is FastAPI (Python), not Fastify.

## Glossary

- **Auth_System**: The complete custom authentication backend comprising FastAPI endpoints, JWT token management, OTP generation/verification, Google OAuth handling, and SIWE wallet verification.
- **Auth_Modal**: The frontend React component providing tabbed authentication UI (Email, Google, Wallet) with registration, login, OTP input, and forgot-password flows.
- **Onboarding_Wizard**: The multi-step frontend flow presented to first-time users after registration: runner name claim → avatar selection → profile wallet creation → optional external wallet link → auto-follow → welcome screen.
- **Token_Manager**: The subsystem responsible for issuing JWT access tokens (HS256, 30-day TTL), JWT refresh tokens (stored in Redis), and handling token refresh and revocation.
- **OTP_Service**: The backend service that generates 6-digit one-time passwords, stores them with a 15-minute TTL, enforces single-use, and invalidates previous OTPs for the same email.
- **Profile_Wallet**: A server-side generated Ethereum wallet (private key encrypted and stored) created for each new user during onboarding, enabling on-chain interactions without requiring MetaMask or any external wallet.
- **SIWE**: Sign In With Ethereum — a standard protocol where users sign a structured message with their Ethereum wallet to prove ownership, used for WalletConnect-based authentication.
- **AuthContext**: The React context provider that replaces the current Privy-based `AuthContext.tsx`, managing authentication state, token storage, and automatic 401 handling via interceptors.
- **Runner_Name**: A unique username (3-20 alphanumeric characters) that claims the subdomain `username.ontrail.tech` for the user's profile.
- **Ancient_Owner**: The highest-privilege role in OnTrail, representing the platform founder.
- **Founders_DAO**: The decentralized governance entity that all new users auto-follow as part of the default social graph.

## Requirements

### Requirement 1: Email + Password Registration

**User Story:** As a new visitor, I want to register with my email and password, so that I can create an OnTrail account without needing a crypto wallet.

#### Acceptance Criteria

1. WHEN a valid email and password are submitted to `POST /auth/register`, THE Auth_System SHALL create a new user record, hash the password with bcrypt (10 rounds), and return a JWT access token and refresh token.
2. WHEN a registration request contains an email that already exists in the database, THE Auth_System SHALL return a 409 Conflict error with the message "Email already registered".
3. THE Auth_System SHALL enforce password requirements: minimum 8 characters, at least one uppercase letter, one lowercase letter, and one digit.
4. WHEN a registration request contains a password that does not meet the requirements, THE Auth_System SHALL return a 422 Validation Error with a descriptive message.
5. THE Auth_System SHALL store the email in lowercase to prevent duplicate accounts with different casing.

### Requirement 2: Email + Password Login

**User Story:** As a returning user, I want to log in with my email and password, so that I can access my OnTrail account.

#### Acceptance Criteria

1. WHEN valid email and password credentials are submitted to `POST /auth/login`, THE Auth_System SHALL verify the password against the stored bcrypt hash and return a JWT access token and refresh token.
2. WHEN an incorrect password is submitted, THE Auth_System SHALL return a 401 Unauthorized error with the message "Invalid credentials".
3. WHEN a non-existent email is submitted, THE Auth_System SHALL return a 401 Unauthorized error with the same "Invalid credentials" message to prevent email enumeration.

### Requirement 3: OTP Passwordless Authentication

**User Story:** As a user, I want to sign in with a one-time code sent to my email, so that I can authenticate without remembering a password.

#### Acceptance Criteria

1. WHEN a valid email is submitted to `POST /auth/request-otp`, THE OTP_Service SHALL generate a 6-digit numeric code, store it with a 15-minute TTL, and send it to the provided email address.
2. WHEN a new OTP is requested for an email that has an existing unused OTP, THE OTP_Service SHALL invalidate the previous OTP before generating the new one.
3. WHEN a valid OTP is submitted to `POST /auth/verify-otp` for an email that has no existing user account, THE Auth_System SHALL auto-create a new user record and return a JWT access token and refresh token.
4. WHEN a valid OTP is submitted to `POST /auth/verify-otp` for an email that has an existing user account, THE Auth_System SHALL return a JWT access token and refresh token for the existing user.
5. WHEN an expired, already-used, or incorrect OTP is submitted, THE Auth_System SHALL return a 401 Unauthorized error with the message "Invalid or expired OTP".
6. THE OTP_Service SHALL enforce that each OTP code is single-use by marking it as consumed after successful verification.

### Requirement 4: Forgot Password OTP Flow

**User Story:** As a user who forgot my password, I want to reset it using a code sent to my email, so that I can regain access to my account.

#### Acceptance Criteria

1. WHEN an email is submitted to `POST /auth/forgot-password`, THE Auth_System SHALL always return a 200 OK response regardless of whether the email exists in the database, to prevent email enumeration.
2. WHEN the email exists in the database, THE OTP_Service SHALL generate a 6-digit reset code with a 15-minute TTL and send it to the email address.
3. WHEN a valid reset OTP and a new password are submitted to `POST /auth/verify-otp` with a `purpose` field set to "reset", THE Auth_System SHALL update the user's password hash with the new bcrypt-hashed password and return a JWT access token and refresh token.
4. THE Auth_System SHALL enforce the same password requirements (minimum 8 characters, uppercase, lowercase, digit) for the new password during reset.

### Requirement 5: Google OAuth Authentication

**User Story:** As a user, I want to sign in with my Google account, so that I can authenticate quickly without creating a separate password.

#### Acceptance Criteria

1. WHEN a valid Google OAuth ID token is submitted to `POST /auth/google`, THE Auth_System SHALL verify the token with Google's token info endpoint, extract the email and profile data, and return a JWT access token and refresh token.
2. WHEN the Google-authenticated email does not match an existing user, THE Auth_System SHALL auto-create a new user record with the Google email and profile name.
3. WHEN the Google-authenticated email matches an existing user, THE Auth_System SHALL return tokens for the existing user account.
4. WHEN an invalid or expired Google ID token is submitted, THE Auth_System SHALL return a 401 Unauthorized error with the message "Invalid Google token".

### Requirement 6: WalletConnect / SIWE Authentication

**User Story:** As a Web3 user, I want to sign in with my Ethereum wallet via WalletConnect, so that I can authenticate using my existing wallet identity.

#### Acceptance Criteria

1. WHEN a wallet address is submitted to `POST /auth/challenge`, THE Auth_System SHALL generate a SIWE-compliant challenge message containing a unique nonce, the domain `ontrail.tech`, and a human-readable statement, and return it to the client.
2. WHEN a valid SIWE signature and the original message are submitted to `POST /auth/wallet`, THE Auth_System SHALL recover the signer address from the signature, verify it matches the claimed wallet address, and return a JWT access token and refresh token.
3. WHEN the verified wallet address does not match an existing user, THE Auth_System SHALL auto-create a new user record with the wallet address.
4. WHEN the verified wallet address matches an existing user, THE Auth_System SHALL return tokens for the existing user account.
5. WHEN an invalid signature is submitted, THE Auth_System SHALL return a 401 Unauthorized error with the message "Invalid signature".
6. THE Auth_System SHALL mark each challenge nonce as used after verification to prevent replay attacks.

### Requirement 7: JWT Token System

**User Story:** As a developer, I want a robust token system with access and refresh tokens, so that users stay authenticated securely with instant revocation capability.

#### Acceptance Criteria

1. THE Token_Manager SHALL issue JWT access tokens using HS256 algorithm with a 30-day TTL and a payload containing `sub` (userId), `email`, `role`, and `wallet_address` fields.
2. THE Token_Manager SHALL issue JWT refresh tokens and store them in Redis with an associated user ID for instant revocation lookup.
3. WHEN a valid refresh token is submitted to `POST /auth/refresh`, THE Token_Manager SHALL verify the refresh token exists in Redis, issue a new access token, and return it.
4. WHEN `POST /auth/logout` is called with a valid refresh token, THE Token_Manager SHALL delete the refresh token from Redis, making it immediately invalid.
5. WHEN an expired or revoked refresh token is submitted to `POST /auth/refresh`, THE Token_Manager SHALL return a 401 Unauthorized error.
6. THE AuthContext SHALL store access and refresh tokens in localStorage and attach the access token as a Bearer header on every API request.
7. WHEN an API request returns a 401 status, THE AuthContext SHALL attempt to refresh the access token using the stored refresh token, and if refresh fails, log the user out and clear stored tokens.

### Requirement 8: Onboarding Step 1 — Runner Name Claim

**User Story:** As a newly registered user, I want to choose a unique runner name, so that I can claim my `username.ontrail.tech` subdomain identity.

#### Acceptance Criteria

1. THE Onboarding_Wizard SHALL present a text input for the runner name as the first onboarding step after initial registration.
2. WHEN the user types a runner name, THE Onboarding_Wizard SHALL perform a debounced availability check (300ms delay) against `GET /identity/check/{username}` and display real-time feedback (available or taken).
3. THE Auth_System SHALL enforce runner name rules: 3-20 characters, alphanumeric and underscores only, case-insensitive uniqueness.
4. THE Auth_System SHALL reject reserved words including "app", "api", "www", "admin", "auth", "ontrail", and "support" with a 409 Conflict error.
5. WHEN a valid and available runner name is submitted, THE Auth_System SHALL update the user record and display a preview of `username.ontrail.tech` as the claimed subdomain.

### Requirement 9: Onboarding Step 2 — Avatar Selection

**User Story:** As a newly registered user, I want to select an avatar, so that I have a visual identity on the platform.

#### Acceptance Criteria

1. THE Onboarding_Wizard SHALL present an avatar selection interface using the KokonutUI AvatarPicker component as the second onboarding step.
2. THE Onboarding_Wizard SHALL provide at least 12 preset avatar options styled in the OnTrail visual language (emerald/green tones, rounded, modern).
3. WHEN the user selects an avatar and confirms, THE Onboarding_Wizard SHALL save the avatar selection to the user profile via the API.

### Requirement 10: Onboarding Step 3 — Profile Wallet Creation

**User Story:** As a newly registered user, I want a blockchain wallet created for me automatically, so that I can participate in on-chain activities without needing MetaMask or any external wallet software.

#### Acceptance Criteria

1. THE Auth_System SHALL generate a server-side Ethereum wallet (address + encrypted private key) for each new user during the profile wallet onboarding step.
2. THE Auth_System SHALL encrypt the private key using AES-256 before storing it in the database, with the encryption key sourced from an environment variable.
3. THE Onboarding_Wizard SHALL display the generated wallet address to the user and explain that this is their OnTrail profile wallet for on-chain interactions.
4. THE Auth_System SHALL store the profile wallet in the `wallets` table with `wallet_type` set to "profile" and link it to the user record.
5. IF the wallet generation process fails, THEN THE Auth_System SHALL return a 500 error with the message "Wallet creation failed" and allow the user to retry.

### Requirement 11: Onboarding Step 4 — Optional External Wallet Link

**User Story:** As a Web3-savvy user, I want to optionally connect my existing MetaMask or WalletConnect wallet, so that I can link my external wallet identity to my OnTrail account.

#### Acceptance Criteria

1. THE Onboarding_Wizard SHALL present an optional step to connect an external wallet via ConnectKit/WalletConnect after the profile wallet is created.
2. WHEN the user connects an external wallet, THE Auth_System SHALL verify ownership via SIWE signature and store the wallet in the `wallets` table with `wallet_type` set to "external" via `POST /auth/connect/wallet`.
3. WHEN the user chooses to skip this step, THE Onboarding_Wizard SHALL advance to the next step without requiring any wallet connection.
4. IF the external wallet address is already linked to a different user account, THEN THE Auth_System SHALL return a 409 Conflict error with the message "Wallet already linked to another account".

### Requirement 12: Onboarding Step 5 — Auto-Follow Default Social Graph

**User Story:** As a newly registered user, I want to automatically follow the Ancient Owner and Founders DAO, so that I have an initial social network on the platform.

#### Acceptance Criteria

1. WHEN the onboarding reaches the auto-follow step, THE Auth_System SHALL create follow relationships between the new user and the Ancient_Owner account and the Founders_DAO account in the `friends` table.
2. THE Auth_System SHALL record a `ReputationEvent` with `event_type` "signup" for the new user after the auto-follow relationships are created.
3. IF the Ancient_Owner or Founders_DAO accounts do not exist in the database, THEN THE Auth_System SHALL skip the auto-follow for the missing account and log a warning, without blocking the onboarding flow.

### Requirement 13: Onboarding Step 6 — Welcome Screen

**User Story:** As a newly registered user, I want to see a welcome screen after completing onboarding, so that I know my setup is complete and I can start exploring the platform.

#### Acceptance Criteria

1. THE Onboarding_Wizard SHALL display a "Welcome to OnTrail" screen as the final onboarding step, showing the user's claimed runner name, avatar, and profile wallet address.
2. THE Onboarding_Wizard SHALL provide a primary CTA button that navigates the user to the first-time user journey entry point (runner landing or explore page).
3. WHEN the user clicks the CTA, THE Onboarding_Wizard SHALL mark the onboarding as complete in the user's profile and transition to the main application.

### Requirement 14: Auth Modal UI

**User Story:** As a visitor, I want a beautiful, modern authentication modal with clear tabs for Email, Google, and Wallet sign-in, so that I can choose my preferred authentication method.

#### Acceptance Criteria

1. THE Auth_Modal SHALL render as a centered overlay modal with three tabs: "Email", "Google", and "Wallet".
2. THE Auth_Modal SHALL style all elements using the OnTrail visual design language: emerald/green primary color (`#10b981` → `#22c55e`), Inter font, rounded-2xl corners, backdrop-blur background, and smooth framer-motion transitions.
3. WHEN the "Email" tab is active, THE Auth_Modal SHALL display a form with email input, password input, a "Sign In" button, a "Create Account" toggle, and a "Forgot Password?" link.
4. WHEN the "Google" tab is active, THE Auth_Modal SHALL display a single "Continue with Google" button that initiates the Google OAuth flow.
5. WHEN the "Wallet" tab is active, THE Auth_Modal SHALL display a ConnectKit wallet connection button that initiates the SIWE authentication flow.
6. WHEN the "Forgot Password?" link is clicked, THE Auth_Modal SHALL display an email input for OTP request, then a 6-digit OTP input component, then a new password form.
7. THE Auth_Modal SHALL display an accessible 6-digit OTP input component with auto-focus advancement between digits and paste support for OTP flows.

### Requirement 15: AuthContext Replacement

**User Story:** As a developer, I want the Privy-based AuthContext fully replaced with a custom AuthContext, so that the application has zero dependency on the Privy SDK.

#### Acceptance Criteria

1. THE AuthContext SHALL provide the same interface shape as the current Privy-based context: `isConnected`, `isLoading`, `wallet`, `userId`, `username`, `email`, `roles`, `isAdmin`, `isAncientOwner`, `login`, `logout`, and `loginWithWallet`.
2. THE AuthContext SHALL initialize by checking localStorage for an existing access token, validating it, and hydrating user state from `GET /users/me` on app boot.
3. THE AuthContext SHALL implement an HTTP interceptor that attaches the Bearer token to all API requests and handles 401 responses by attempting a token refresh before logging out.
4. WHEN `login()` is called, THE AuthContext SHALL open the Auth_Modal.
5. WHEN `logout()` is called, THE AuthContext SHALL call `POST /auth/logout`, clear tokens from localStorage, and reset all auth state.
6. THE AuthContext SHALL remove all imports and references to the Privy SDK (`@privy-io/react-auth`).

### Requirement 16: Rate Limiting on Auth Endpoints

**User Story:** As a platform operator, I want rate limiting on all authentication endpoints, so that the system is protected against brute-force and abuse attacks.

#### Acceptance Criteria

1. THE Auth_System SHALL enforce rate limits on all auth endpoints: maximum 5 requests per minute per IP for `POST /auth/login`, `POST /auth/register`, `POST /auth/verify-otp`, and `POST /auth/wallet`.
2. THE Auth_System SHALL enforce rate limits on OTP request endpoints: maximum 3 requests per minute per email for `POST /auth/request-otp` and `POST /auth/forgot-password`.
3. WHEN a rate limit is exceeded, THE Auth_System SHALL return a 429 Too Many Requests error with a `Retry-After` header indicating seconds until the limit resets.

### Requirement 17: User Profile Endpoint

**User Story:** As an authenticated user, I want to retrieve my profile data, so that the frontend can display my account information.

#### Acceptance Criteria

1. WHEN an authenticated request is made to `GET /users/me`, THE Auth_System SHALL return the current user's profile including `id`, `username`, `email`, `wallet_address`, `avatar_url`, `reputation_score`, `roles`, and `onboarding_completed` status.
2. WHEN an unauthenticated request is made to `GET /users/me`, THE Auth_System SHALL return a 401 Unauthorized error.

### Requirement 18: Change Password

**User Story:** As an authenticated user, I want to change my password, so that I can update my credentials for security.

#### Acceptance Criteria

1. WHEN a valid current password and new password are submitted to `POST /users/me/change-password`, THE Auth_System SHALL verify the current password, hash the new password with bcrypt (10 rounds), and update the stored hash.
2. WHEN an incorrect current password is submitted, THE Auth_System SHALL return a 401 Unauthorized error with the message "Current password is incorrect".
3. THE Auth_System SHALL enforce the same password requirements (minimum 8 characters, uppercase, lowercase, digit) for the new password.

### Requirement 19: Privy SDK Removal

**User Story:** As a developer, I want all Privy SDK dependencies removed from the codebase, so that the application is fully self-contained with no third-party auth provider lock-in.

#### Acceptance Criteria

1. THE Auth_System SHALL remove the `@privy-io/react-auth` package from `apps/web/package.json`.
2. THE Auth_System SHALL remove all Privy provider wrappers (e.g., `PrivyProvider`) from the React component tree in `apps/web/src/main.tsx` or `App.tsx`.
3. THE Auth_System SHALL replace all `usePrivy()` hook calls throughout the codebase with the new custom `useAuth()` hook from the replacement AuthContext.
4. THE Auth_System SHALL remove any Privy-related environment variables (e.g., `VITE_PRIVY_APP_ID`) from `.env` and `.env.example` files.
