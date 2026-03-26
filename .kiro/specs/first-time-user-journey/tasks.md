# Tasks: First-Time User Journey

## Task 1: Subdomain Resolver Utility
- [x] Create `apps/web/src/lib/subdomain.ts` with `resolveRunnerFromSubdomain(hostname: string): string | null`
- [x] Return lowercase username for `{username}.ontrail.tech` hostnames
- [x] Return `null` for reserved subdomains: `ontrail.tech`, `app.ontrail.tech`, `api.ontrail.tech`, `www.ontrail.tech`
- [x] Add unit tests in `apps/web/src/lib/__tests__/subdomain.test.ts`
> **Requirement(s):** 1.1, 1.2

## Task 2: Journey Orchestrator State Machine
- [x] Create `apps/web/src/lib/journey.ts` with `JourneyPhase` type, `JourneyState` interface, phase order, prerequisites, and skippable phases
- [x] Implement `useJourney()` React hook: `advance()`, `skipTo()`, `canAdvance()`, `getState()`
- [x] Persist state to localStorage on every change; restore on mount
- [x] Track `softCommitted` flag for pre-auth commitment
- [x] Gate post-onboarding phases behind Privy auth check
- [x] Allow skipping the `identity` phase
- [x] Add unit tests for phase transitions, prerequisite enforcement, persistence round-trip
> **Requirement(s):** 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 2.2, 2.3

## Task 3: Backend — Runner Profile Aggregated Endpoint
- [x] Create `GET /users/runner/{username}` endpoint in `services/api/routers/users.py`
- [x] Return `RunnerProfileData`: reputation, rank, token status, FriendPass supply + cached price, activity feed
- [x] Cache full response in Redis with 60s TTL
- [x] Cache FriendPass price separately in Redis with 5-10s TTL (read from chain on cache miss)
- [x] Return 404 with message if runner username not found
- [x] Include `activityFeed` array: recent joins, FriendPass buys, tips (last 1 hour, max 10 items)
> **Requirement(s):** 1.3, 1.4, 1.5, 1.7, 1.9

## Task 4: Runner Landing Page Component (Phase 1)
- [x] Create `apps/web/src/pages/RunnerLanding.tsx`
- [x] Use `resolveRunnerFromSubdomain()` to extract runner username
- [x] Fetch runner profile data from aggregated API endpoint
- [x] Render hero section with FlowField background (KokonutUI), OnTrail logo, runner avatar, rank badge
- [x] Render AppleActivityCard (KokonutUI) with reputation rings
- [x] Display FriendPass supply bar ("23/100 positions secured"), price in ETH + fiat, momentum meter
- [x] Display live activity feed as social proof
- [x] Use positioning language on CTA: "Secure your position"
- [x] Store `?ref=` query param in localStorage on mount
- [x] Render friendly 404 if runner not found
> **Requirement(s):** 1.1–1.9, 2.4

## Task 5: Pre-Auth Soft Commitment Flow
- [x] On CTA click in RunnerLanding, show "🔥 Reserving your spot..." animation (1-2s) before opening Privy modal
- [x] Set `softCommitted: true` in journey state and persist to localStorage
- [x] On return visit with `softCommitted` flag and no auth, re-display auth prompt automatically
> **Requirement(s):** 2.1, 2.2, 2.3

## Task 6: Backend — Onboarding Registration Endpoint
- [x] Create `POST /onboarding/register` endpoint in `services/api/routers/onboarding.py`
- [x] Accept Privy JWT token, validate server-side
- [x] Create user record with wallet address, email
- [x] Record `reputation_event` for signup
- [x] If `referrerUsername` provided: look up referrer, create referral record with status `registered`, record `reputation_event` for referrer
- [x] Enforce self-referral prevention (`referrer.id ≠ new_user.id`)
- [x] Enforce referral code replay protection (idempotent — no duplicate referral records)
- [x] Return JWT + user data
- [x] Add Redis rate limiting on this endpoint
> **Requirement(s):** 3.3, 3.4, 7.5, 7.8, 7.9, 16.2, 16.3

## Task 7: Privy Auth Integration (Phase 2)
- [x] Ensure `AuthContext.tsx` uses Privy SDK with email + Google login options
- [x] Verify no wallet jargon, gas fees, or blockchain terminology in auth modal
- [x] On successful auth: call `POST /onboarding/register` with Privy token + referrer from localStorage
- [x] Advance journey to `friendpass_purchase` phase
> **Requirement(s):** 3.1, 3.2, 3.3

## Task 8: Backend — FriendPass Price Cache Endpoint
- [x] Create `GET /friendpass/price/{runner_id}` endpoint in `services/api/routers/friendpass.py`
- [x] Serve price from Redis cache (5-10s TTL)
- [x] On cache miss: read from FriendShares contract on Base L2, cache result
- [x] Return: `currentPrice` (ETH + fiat), `nextPrice`, `currentSupply`, `maxSupply`, `benefits` list
- [x] Include staleness check — refresh if cache age > 10s
> **Requirement(s):** 4.1, 1.4

## Task 9: FriendPass Purchase Screen Component (Phase 3)
- [x] Create `apps/web/src/components/journey/FriendPassPurchase.tsx`
- [x] Fetch price from cached API endpoint
- [x] Display supply bar, price in ETH + fiat, next price, benefits list
- [x] Use positioning language: "Secure your position", "Price increases to X after this position"
- [x] Execute 1-click purchase via Privy embedded wallet → FriendShares.buy() on Base L2
- [x] Show optimistic confirmation immediately after TX submitted
- [x] Handle error states: supply exhausted (show "All positions claimed" + boost CTA), insufficient ETH (show Privy fiat on-ramp), TX failure (retry button)
- [x] Enforce anti-whale check (max 3-5 per wallet, read from contract)
- [x] Enforce self-purchase prevention (buyer ≠ runner)
> **Requirement(s):** 4.1–4.8

## Task 10: Backend — Event Indexer for FriendPass Mints and Tips
- [x] Create `services/api/engines/event_indexer.py`
- [x] Poll Base L2 chain events every 5-10 seconds for FriendShares mint events and TipVault tip events
- [x] On FriendPass mint: create `friend_shares` record, record `reputation_event` for buyer + runner, update runner `reputation_score`
- [x] On tip: create tip record, record `reputation_event`
- [x] Ensure idempotent processing (don't re-process already-indexed events)
- [x] Target: database record created within 30 seconds of on-chain event
> **Requirement(s):** 4.5, 8.4, 14.1, 14.2, 14.3

## Task 11: Backend — FriendPass Status Endpoint
- [x] Create `GET /friendpass/status/{tx_hash}` endpoint
- [x] Return FriendPass number, total supply, percentile, confirmed status
- [x] Poll event indexer results — return optimistic data if not yet indexed, confirmed data once indexed
> **Requirement(s):** 5.1, 5.2

## Task 12: Confirmation + Micro-Dashboard Component (Phase 4)
- [x] Create `apps/web/src/components/journey/Confirmation.tsx`
- [x] Display FriendPass number ("#24"), total supply, percentile ("Top 24%"), rank
- [x] Show optimistic data immediately; update when event indexer confirms
- [x] If TX fails: revert UI to pre-transaction state within 15 seconds
- [x] Auto-generate shareable card for this milestone
- [x] Advance journey to `identity` phase
> **Requirement(s):** 5.1, 5.2, 5.3

## Task 13: Backend — Identity Claim Endpoints
- [x] Create `GET /identity/check/{username}` endpoint — check availability, validate against reserved words
- [x] Create `POST /identity/claim` endpoint — update user record with username + avatar, return confirmed subdomain
- [x] Reserved words list: `app`, `api`, `www`, `admin`, `ontrail`, `support`, `help`
- [x] Validate username format: lowercase, alphanumeric + hyphens, 3-20 chars
> **Requirement(s):** 6.2, 6.3, 6.4, 16.5


## Task 14: Identity Claim Screen Component (Phase 5)
- [x] Create `apps/web/src/components/journey/ClaimIdentity.tsx`
- [x] Render KokonutUI `AvatarPicker` with preset avatar options and rotation animation
- [x] Username text input with live `username.ontrail.tech` preview
- [x] Debounced availability check via `GET /identity/check/{username}`
- [x] Show validation errors for reserved words and invalid formats
- [x] On submit: call `POST /identity/claim`, advance journey to `referral` phase
- [x] Provide skip button to advance without claiming
> **Requirement(s):** 6.1, 6.2, 6.3, 6.4, 6.5

## Task 15: Backend — Referral Generation and Attribution Endpoints
- [x] Create `POST /referrals/generate` endpoint — return referral link (username-based or code-based) and referral code
- [x] Ensure idempotent generation: same user always gets same referral code
- [x] Create `GET /referrals/stats/{user_id}` endpoint — return total referrals, active referrals, reputation earned, rewards earned
- [x] On referral conversion (FriendPass purchase by referred user): update referral status to `converted`, create `referral_reward` records, recalculate referrer reputation — all in single DB transaction
- [x] Generate referral codes using cryptographically random values
> **Requirement(s):** 7.3, 7.5, 7.6, 7.8, 7.9, 16.1

## Task 16: Referral Screen Component (Phase 6)
- [x] Create `apps/web/src/components/journey/ReferralScreen.tsx`
- [x] Display `username.ontrail.tech` as referral link if username claimed, else generic `?ref=` link
- [x] Share buttons: X (Twitter) with pre-filled positioning language text, copy link, native mobile share
- [x] Display incentive breakdown: reputation boost per referral, FriendPass reward %, early access benefit
- [x] Show referral stats: total referrals, active, reputation earned, rewards earned
- [x] Emotional conversion notification component: "🎉 Alice joined through you! 📈 Your influence just increased"
- [x] Track share clicks for analytics
> **Requirement(s):** 7.1, 7.2, 7.4, 7.7

## Task 17: Boost Screen Component (Phase 7)
- [x] Create `apps/web/src/components/journey/BoostScreen.tsx`
- [x] Fetch token progress from `GET /runners/{id}/token-progress`
- [x] Display momentum meter: "🚀 Momentum building — 72% to launch" with progress bar
- [x] Show total tips, user contribution, supporter count, TGE threshold
- [x] Tip amount selector + CTA: "Boost [Runner]"
- [x] Execute tip via TipVault.tipRunner() through Privy wallet
- [x] Optimistic UI: update progress bar immediately after TX submitted
> **Requirement(s):** 8.1, 8.2, 8.3

## Task 18: Backend — Token Progress Endpoint
- [x] Create `GET /runners/{runner_id}/token-progress` endpoint
- [x] Return: token status, progress %, total tips, user contribution, TGE threshold, supporter count, momentum label
- [x] Momentum label logic: < 40% = "building", 40-75% = "surging", > 75% = "near_launch"
> **Requirement(s):** 8.1

## Task 19: Backend — Dashboard Aggregated Endpoint
- [x] Create `GET /dashboard/progress` endpoint
- [x] Return: reputation (score, rank, percentile), supporters (count, trend), token progress, FriendPass holdings, streak data, rank movement, nearby POIs
- [x] Single endpoint — no multiple API calls from frontend
- [x] Include rank change since last visit for loss-based notifications
> **Requirement(s):** 9.1, 9.3, 9.4

## Task 20: Progress Dashboard Component (Phase 8)
- [x] Create `apps/web/src/components/journey/ProgressDashboard.tsx`
- [x] Render KokonutUI `AppleActivityCard` with 3 rings: Steps (green), Reputation (orange), Token Activity (pink)
- [x] Display 4 key metrics: reputation score, rank, supporters, token progress
- [x] Retention hooks: daily streak counter, rank movement ("↑ 12 since yesterday"), nearby POI alerts
- [x] Loss-based notifications: "Someone passed you", "You dropped 3 ranks" if rank dropped
- [x] CTA to explore more features
> **Requirement(s):** 9.1, 9.2, 9.3, 9.4

## Task 21: OnTrail Loader Component (Sitewide)
- [x] Create `apps/web/src/components/OnTrailLoader.tsx`
- [x] Wrap KokonutUI `Loader` with OnTrail brand colors (emerald/green gradient)
- [x] Support `fullscreen` and `inline` variants
- [x] Accept `message` and `subMessage` props for contextual loading text
- [x] Animated transitions in/out with framer-motion
- [x] Use during: Privy auth, FriendPass TX, tip TX, page transitions
> **Requirement(s):** Design — Component 2

## Task 22: Shareable Card Generator — Frontend
- [x] Create `apps/web/src/components/ShareableCard.tsx`
- [x] Render styled card with: avatar, headline, subheadline, 2-3 stats, OnTrail logo watermark, `username.ontrail.tech` URL
- [x] Support background variants: emerald (FriendPass), purple (milestones), amber (legendary), blue (exploration)
- [x] Export as PNG via canvas/html2canvas for download
- [x] Share to X with pre-filled text + card link
- [x] Copy link button
> **Requirement(s):** 11.2, 11.3, 11.5

## Task 23: Backend — Shareable Card OG Image Generation
- [x] Create `POST /cards/generate` endpoint — accept card type, data, create ShareableCard record
- [x] Create `GET /api/cards/{card_id}` endpoint — serve OG image (server-rendered PNG)
- [x] Create `GET /cards/{card_id}` HTML page with OG meta tags for link previews
- [x] Generate card image within 5 seconds of shareable event
- [x] Track `shareCount` and `clickCount` on card records
> **Requirement(s):** 11.1, 11.4

## Task 24: Backend — Loss Notification Engine
- [x] Create `services/api/engines/loss_notifications.py`
- [x] Background job (every 5 min): compare current ranks to previous snapshot, detect rank drops and overtakes
- [x] Trigger "passed by" notification when another user overtakes current user
- [x] Trigger "rank drop" notification when user drops 3+ positions
- [x] Trigger "streak risk" notification 4 hours before daily streak expires
- [x] Rate limit: max 3 loss notifications per user per 24-hour window
- [x] Each notification includes CTA deep link to relevant page
- [x] Store notifications in `user_notifications` table
> **Requirement(s):** 12.1, 12.2, 12.3, 12.4, 12.5, 12.6

## Task 25: Frontend — Notification Bell + Loss Notifications
- [x] Create `apps/web/src/components/NotificationBell.tsx`
- [x] Fetch unread notifications from `GET /notifications` endpoint
- [x] Display notification count badge
- [x] Dropdown with notification list: message, urgency indicator, CTA link, time ago
- [x] Mark as read on click
- [x] Loss notifications styled with rose/pink accent per design language
> **Requirement(s):** 12.1, 12.6

## Task 26: Backend — Influence Graph Endpoint
- [x] Create `GET /referrals/influence/{user_id}` endpoint
- [x] Return: total network size, direct referrals count, network value (ETH), growth rate, influence score, node list
- [x] Each node: userId, username, avatar, level, joinedAt, friendPassesBought, reputationScore, isActive (last 7 days)
- [x] Ensure `directReferrals` count matches actual referral records with status `registered` or `converted`
> **Requirement(s):** 13.1, 13.2, 13.3, 13.4

## Task 27: Influence Graph Component
- [x] Create `apps/web/src/components/InfluenceGraph.tsx`
- [x] Render radial/tree graph with user at center, referrals as connected nodes
- [x] Display aggregate stats: network size, network value (ETH), growth rate
- [x] Each node shows: avatar, username, active/inactive status
- [x] Highlight most valuable referrals
- [x] CTA: "Grow your network" → referral screen
- [x] Accessible from dashboard (Phase 8) and profile page
> **Requirement(s):** 13.1, 13.2, 13.4

## Task 28: Backend — Reputation Engine Integration
- [x] Ensure `services/api/engines/reputation_engine.py` creates `reputation_event` rows for: signup, FriendPass purchase, referral conversion, tip
- [x] Enforce monotonicity: positive events never decrease score
- [x] Enforce floor: score never below 0.0
- [x] Each event includes `event_type`, `weight`, optional `event_metadata`
> **Requirement(s):** 15.1, 15.2, 15.3

## Task 29: KokonutUI Setup and Component Installation
- [x] Add KokonutUI registry to `apps/web/components.json`: `"@kokonutui": "https://kokonutui.com/r/{name}.json"`
- [x] Install base utilities: `npx shadcn@latest add https://kokonutui.com/r/utils.json -c ./apps/web`
- [x] Install components: `flow-field`, `apple-activity-card`, `avatar-picker`, `profile-dropdown`, `smooth-drawer`, `loader`
- [x] Verify all components render correctly with Tailwind CSS v4
> **Requirement(s):** Design — KokonutUI Setup

## Task 30: App Router Integration
- [x] Add runner subdomain detection in `App.tsx` — if subdomain resolved, render `RunnerLanding` with `JourneyOrchestrator`
- [x] Conditionally render journey phase components based on orchestrator state
- [x] Ensure Layout removes padding/max-width for journey pages (full-bleed)
- [x] Wire up `SmoothDrawer` for mobile nav, `ProfileDropdown` for desktop nav sitewide
> **Requirement(s):** 1.1, 10.1

## Task 31: Database Migrations for New Tables
- [x] Add `referrals` table: id, referrer_id, referred_id, referral_code, runner_context, status, converted_at, created_at
- [x] Add `referral_rewards` table: id, referral_id, referrer_id, reward_type, amount, tx_hash, created_at
- [x] Add `journey_events` table: id, user_id, session_id, runner_username, phase, action, metadata, timestamp, duration_ms
- [x] Add `shareable_cards` table: id, user_id, type, headline, image_url, share_count, click_count, created_at
- [x] Add `user_notifications` table: id, user_id, type, message, urgency, action_url, read, created_at
- [x] Create Alembic migration file in `services/api/alembic/versions/`
> **Requirement(s):** Design — Data Models 1-5

## Task 32: FriendShares Contract Revenue Distribution Verification
- [x] Verify `contracts/contracts/FriendShares.sol` distributes revenue as: 70% TipVault, 20% DAO, 10% Ancient Owner
- [x] Verify linear pricing formula: `Price(n) = basePrice + slope * n`
- [x] Verify anti-whale: max passes per wallet enforced at contract level
- [x] Verify self-purchase prevention at contract level
- [x] Add/update Hardhat tests for revenue split, pricing, and access control
> **Requirement(s):** 4.9, 4.10, 4.7, 4.8