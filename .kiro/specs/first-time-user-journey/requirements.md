# Requirements Document

## Introduction

This document defines the requirements for the First-Time User Journey feature of the OnTrail platform. The feature converts a new visitor arriving at a runner's subdomain (`username.ontrail.tech`) into a registered user, FriendPass holder, token economy participant, and promoter through an 8-phase funnel: Landing → Instant Onboarding → First Conversion → Confirmation + Micro-Dashboard → Identity Creation → Distributor → Hook/Boost → Progress Dashboard. Three viral/engagement systems complement the funnel: Shareable Cards, Loss Notification Engine, and Influence Graph.

## Glossary

- **Journey_Orchestrator**: The frontend state machine that manages user progression through the 8 journey phases, persists state to localStorage, and gates phase transitions based on prerequisites.
- **Runner_Landing_Page**: The subdomain landing page component that renders a runner's profile, live stats, activity feed, social proof, and the primary CTA for new visitors.
- **FriendPass_Purchase_Screen**: The frontend component that displays FriendPass pricing, supply visualization, benefits, and executes 1-click purchase via Privy embedded wallet.
- **Confirmation_Dashboard**: The micro-dashboard shown immediately after FriendPass purchase displaying rank, percentile, and early supporter status.
- **Identity_Claim_Screen**: The username and avatar selection component where users claim their `username.ontrail.tech` subdomain identity.
- **Referral_Screen**: The component that converts users into distribution nodes by showing their personal referral link and sharing incentives.
- **Boost_Screen**: The component showing runner token progress with a momentum meter and tip/boost CTA.
- **Progress_Dashboard**: The lightweight dashboard showing reputation rings, rank, supporters, token progress, and retention hooks.
- **Shareable_Card_Generator**: The system that auto-generates branded social cards for milestones, achievements, and shareable events.
- **Loss_Notification_Engine**: The background system that monitors rank changes, streak breaks, and competitor activity to trigger loss-aversion re-engagement notifications.
- **Influence_Graph**: The network visualization component showing a user's referral tree, network value, and influence propagation.
- **Subdomain_Resolver**: The function that extracts a runner username from the wildcard subdomain hostname.
- **Backend_API**: The FastAPI backend providing all API endpoints for onboarding, referrals, identity, pricing, and dashboard data.
- **Event_Indexer**: The backend process that polls on-chain events (FriendPass mints, tips) and syncs them to the PostgreSQL database as the source of truth.
- **Privy_Auth**: The Privy SDK integration providing email/social login with automatic embedded wallet creation.
- **FriendPass**: An ERC-1155 NFT representing limited-access social investment in a runner, with increasing mint price and capped supply.
- **TipVault**: The on-chain contract that collects tips for runners and triggers Token Generation Events.
- **Soft_Commitment**: The pre-auth UX pattern where a reservation animation plays before the auth modal, psychologically committing the user before login.
- **Optimistic_UI**: The pattern of showing transaction confirmation immediately after TX submission without waiting for on-chain confirmation.
- **Positioning_Language**: Copy that frames actions as securing a position or getting in early, rather than buying or purchasing.

## Requirements

### Requirement 1: Subdomain Resolution and Runner Landing

**User Story:** As a visitor arriving at a runner's subdomain, I want to see the runner's profile with live stats and social proof, so that I can evaluate whether to support this runner.

#### Acceptance Criteria

1. WHEN a visitor navigates to `{username}.ontrail.tech`, THE Subdomain_Resolver SHALL extract the runner username from the hostname and return it in lowercase.
2. WHEN the hostname is `ontrail.tech`, `app.ontrail.tech`, `api.ontrail.tech`, or `www.ontrail.tech`, THE Subdomain_Resolver SHALL return null and not treat the request as a runner subdomain.
3. WHEN a valid runner username is resolved, THE Runner_Landing_Page SHALL fetch the runner's profile data from the Backend_API including reputation score, rank, FriendPass supply and cached price, token status, and activity feed.
4. WHEN the runner profile data is fetched, THE Backend_API SHALL serve FriendPass pricing from Redis cache with a maximum staleness of 10 seconds.
5. WHEN the runner profile data is fetched, THE Backend_API SHALL return the data from a single aggregated API endpoint cached in Redis with a 60-second TTL.
6. WHEN the Runner_Landing_Page renders, THE Runner_Landing_Page SHALL display the FriendPass supply visualization (e.g., "23/100 positions secured"), current price in ETH and fiat, and a momentum meter showing token progress percentage.
7. WHEN the Runner_Landing_Page renders, THE Runner_Landing_Page SHALL display a live activity feed showing recent joins, FriendPass purchases, and tips as social proof.
8. WHEN the URL contains a `?ref=` query parameter, THE Runner_Landing_Page SHALL store the referral code in localStorage for later attribution during registration.
9. IF the runner username does not match any existing user, THEN THE Runner_Landing_Page SHALL display a friendly 404 page with a message and a CTA to explore other runners.

### Requirement 2: Pre-Auth Soft Commitment

**User Story:** As a visitor, I want to feel like I am securing a position before being asked to log in, so that I am psychologically committed to completing the signup.

#### Acceptance Criteria

1. WHEN a visitor clicks the primary CTA ("Secure your position"), THE Runner_Landing_Page SHALL display a reservation animation ("🔥 Reserving your spot...") for 1-2 seconds before opening the Privy_Auth modal.
2. WHEN the soft commitment animation begins, THE Journey_Orchestrator SHALL set the `softCommitted` flag to true and persist it to localStorage.
3. WHEN a soft-committed visitor returns to the page without completing auth, THE Runner_Landing_Page SHALL detect the persisted `softCommitted` flag and re-display the auth prompt.
4. THE Runner_Landing_Page SHALL use positioning language ("Secure your position", "Get in early") on all CTAs instead of transactional language ("Buy FriendPass").

### Requirement 3: Instant Onboarding via Privy

**User Story:** As a new visitor, I want to sign up with my email or social account without needing crypto knowledge, so that I can join quickly and frictionlessly.

#### Acceptance Criteria

1. WHEN the Privy_Auth modal opens, THE Privy_Auth SHALL present "Continue with Google" and "Continue with Email" options without displaying wallet addresses, gas fees, or blockchain terminology.
2. WHEN a user completes Privy authentication, THE Privy_Auth SHALL automatically create an embedded wallet for the user without requiring manual wallet setup.
3. WHEN authentication succeeds, THE Backend_API SHALL create a user record, associate the embedded wallet, record a `reputation_event` for signup, and return a JWT.
4. WHEN a referral code exists in localStorage at the time of registration, THE Backend_API SHALL associate the new user with the referrer by creating a referral record with status `registered`.

### Requirement 4: FriendPass Purchase (First Conversion)

**User Story:** As a newly registered user, I want to purchase a FriendPass for the runner I am visiting, so that I can secure an early position and gain financial and social benefits.

#### Acceptance Criteria

1. WHEN the FriendPass_Purchase_Screen loads, THE FriendPass_Purchase_Screen SHALL fetch the current FriendPass price from the Backend_API cache (not a live chain call) and display it in ETH and fiat equivalent.
2. WHEN the FriendPass_Purchase_Screen renders, THE FriendPass_Purchase_Screen SHALL display the current supply count, maximum supply, benefits list, and the price of the next position after this mint.
3. WHEN a user clicks the purchase CTA, THE FriendPass_Purchase_Screen SHALL execute a 1-click purchase via the Privy embedded wallet by calling the FriendShares ERC-1155 contract on Base L2.
4. WHEN a purchase transaction is submitted, THE FriendPass_Purchase_Screen SHALL display an optimistic confirmation immediately without waiting for on-chain confirmation.
5. WHEN a FriendPass is minted on-chain, THE Event_Indexer SHALL detect the mint event, create a `friend_shares` record, record `reputation_event` entries for both buyer and runner, and update the runner's `reputation_score`.
6. WHEN a FriendPass purchase is attempted and `currentSupply >= maxSupply`, THE FriendPass_Purchase_Screen SHALL reject the purchase and display an "All FriendPasses claimed" message with an alternative CTA to tip/boost the runner.
7. WHEN a user already holds the maximum allowed FriendPasses (3-5) for a given runner, THE FriendPass_Purchase_Screen SHALL prevent additional purchases for that runner.
8. WHEN a user attempts to purchase a FriendPass for a runner whose wallet address matches the buyer's wallet address, THE FriendPass_Purchase_Screen SHALL reject the purchase.
9. WHEN a FriendPass is purchased at price P, THE FriendShares contract SHALL distribute revenue as 70% to TipVault, 20% to Founders DAO, and 10% to Ancient Owner.
10. THE FriendPass pricing model SHALL ensure that `price(supply = n+1) > price(supply = n)` for all supply values, following the formula `Price(n) = basePrice + slope * n`.

### Requirement 5: Confirmation and Micro-Dashboard

**User Story:** As a user who just purchased a FriendPass, I want to see my rank, percentile, and early supporter status immediately, so that I get instant positive feedback on my decision.

#### Acceptance Criteria

1. WHEN a FriendPass purchase transaction is submitted, THE Confirmation_Dashboard SHALL display the user's FriendPass number (e.g., "#24"), total supply, and percentile (e.g., "Top 24%") immediately using optimistic data.
2. WHEN the Event_Indexer confirms the on-chain transaction, THE Confirmation_Dashboard SHALL update the displayed data with confirmed values.
3. IF an optimistic UI update is shown and the on-chain transaction subsequently fails, THEN THE Confirmation_Dashboard SHALL revert the UI state to the pre-transaction state within 15 seconds.

### Requirement 6: Identity Creation

**User Story:** As a new supporter, I want to claim a username and avatar to establish my `username.ontrail.tech` identity, so that I have a personal brand to share before being asked to refer others.

#### Acceptance Criteria

1. WHEN the Identity_Claim_Screen loads, THE Identity_Claim_Screen SHALL render an avatar picker and a username text input with a live subdomain preview (`username.ontrail.tech`).
2. WHEN a user types a username, THE Identity_Claim_Screen SHALL perform a debounced availability check against the Backend_API.
3. WHEN a username matches a reserved word (`app`, `api`, `www`, `admin`), THE Identity_Claim_Screen SHALL reject the username and display an unavailability message.
4. WHEN a user submits a valid, available username and avatar, THE Backend_API SHALL update the user record with the claimed username and return the confirmed subdomain.
5. WHEN the Identity_Claim_Screen is presented, THE Identity_Claim_Screen SHALL provide a skip button allowing the user to advance without claiming a username.

### Requirement 7: Referral Distribution

**User Story:** As a user with a claimed identity, I want to share my personal referral link and earn rewards when my referrals convert, so that I am incentivized to grow the network.

#### Acceptance Criteria

1. WHEN the Referral_Screen loads for a user with a claimed username, THE Referral_Screen SHALL display `{username}.ontrail.tech` as the primary referral link.
2. WHEN the Referral_Screen loads for a user without a claimed username, THE Referral_Screen SHALL display a generic referral link with a `?ref={referralCode}` parameter.
3. WHEN a referral link is generated for a user, THE Backend_API SHALL return the same referral code for subsequent requests from the same user (idempotent generation).
4. WHEN a user clicks a share button (X/Twitter, copy link, native share), THE Referral_Screen SHALL pre-fill the share text with dynamic stats including rank, token price, and positioning language.
5. WHEN a referred user signs up through a referral link, THE Backend_API SHALL create a referral record linking the referrer and referred user with status `registered`.
6. WHEN a referred user subsequently purchases a FriendPass, THE Backend_API SHALL update the referral status to `converted`, create `referral_reward` records for reputation boost and commission, and recalculate the referrer's `reputation_score`.
7. WHEN a referral converts, THE Referral_Screen SHALL display an emotional conversion notification to the referrer (e.g., "🎉 Alice joined through you! 📈 Your influence just increased").
8. THE Backend_API SHALL enforce that a referral code can only attribute one signup per referred user, preventing duplicate referral records from repeated submissions.
9. THE Backend_API SHALL enforce that a user cannot refer themselves (`referrer.id ≠ referred.id`).

### Requirement 8: Boost and Tip (Hook Phase)

**User Story:** As a supporter, I want to tip or boost the runner I support and see the impact on their token launch progress, so that I feel invested in their success.

#### Acceptance Criteria

1. WHEN the Boost_Screen loads, THE Boost_Screen SHALL fetch and display the runner's token progress percentage, total tips in ETH, the user's personal contribution, TGE threshold, supporter count, and a momentum label ("building", "surging", "near_launch").
2. WHEN a user clicks the boost CTA, THE Boost_Screen SHALL execute a tip transaction via the TipVault contract through the Privy embedded wallet.
3. WHEN a tip transaction is submitted, THE Boost_Screen SHALL update the progress bar and contribution display immediately using optimistic UI.
4. WHEN the Event_Indexer detects a tip event on-chain, THE Event_Indexer SHALL create a tip record and a `reputation_event` in the database.

### Requirement 9: Progress Dashboard

**User Story:** As a new user who completed the journey, I want to see my reputation, rank, supporters, and token progress in a lightweight dashboard, so that I can track my early progress without being overwhelmed.

#### Acceptance Criteria

1. WHEN the Progress_Dashboard loads, THE Progress_Dashboard SHALL fetch aggregated dashboard data from a single Backend_API endpoint and display reputation score, rank, percentile, supporter count and trend, token progress, and FriendPass holdings.
2. WHEN the Progress_Dashboard renders, THE Progress_Dashboard SHALL display three concentric activity rings representing Steps (green), Reputation (orange), and Token Activity (pink).
3. WHEN the Progress_Dashboard renders, THE Progress_Dashboard SHALL display retention hooks including a daily streak counter, rank movement indicator (e.g., "↑ 12 since yesterday"), and nearby POI alerts.
4. WHEN a user's rank has dropped since their last visit, THE Progress_Dashboard SHALL display a loss-based notification (e.g., "Someone passed you", "You dropped 3 ranks").

### Requirement 10: Journey State Machine

**User Story:** As a user progressing through the journey, I want my progress to be saved and phase transitions to be enforced, so that I can resume where I left off and follow the intended flow.

#### Acceptance Criteria

1. THE Journey_Orchestrator SHALL enforce the phase order: landing → onboarding → friendpass_purchase → confirmation → identity → referral → hook → dashboard.
2. WHEN a phase transition is requested, THE Journey_Orchestrator SHALL verify that all prerequisite phases for the target phase are in the user's `completedPhases` list before allowing the transition.
3. WHEN a user is not authenticated, THE Journey_Orchestrator SHALL prevent entry to any phase after `onboarding` (friendpass_purchase, confirmation, identity, referral, hook, dashboard).
4. WHEN a phase is completed or the journey state changes, THE Journey_Orchestrator SHALL persist the updated state to localStorage immediately.
5. WHEN a user reloads the page, THE Journey_Orchestrator SHALL restore the journey state from localStorage and resume at the previously active phase.
6. WHEN the identity phase is reached, THE Journey_Orchestrator SHALL allow the user to skip it and advance to the referral phase.

### Requirement 11: Shareable Cards (Viral Distribution)

**User Story:** As a user who achieves a milestone, I want an auto-generated, visually appealing social card, so that I can share my achievement on social media and attract new users.

#### Acceptance Criteria

1. WHEN a shareable event occurs (FriendPass purchase, rank up, TGE, POI discovery, streak milestone, referral milestone), THE Shareable_Card_Generator SHALL create a ShareableCard record with a valid `imageUrl` within 5 seconds.
2. WHEN a shareable card is generated, THE Shareable_Card_Generator SHALL include the user's avatar, achievement headline, 2-3 key stats, OnTrail branding, and the user's `username.ontrail.tech` URL.
3. WHEN a user shares a card to X/Twitter, THE Shareable_Card_Generator SHALL open a share intent with pre-filled text and the card image.
4. WHEN a user copies a card link, THE Backend_API SHALL serve OG meta tags at the card URL so the card renders as a rich preview on social platforms.
5. WHEN a user downloads a card, THE Shareable_Card_Generator SHALL export the card as a PNG image suitable for Instagram stories and direct sharing.

### Requirement 12: Loss Notification Engine (Re-engagement)

**User Story:** As an active user, I want to be notified when my rank drops, someone passes me, or my streak is at risk, so that I am motivated to take action and maintain my position.

#### Acceptance Criteria

1. WHEN another user passes the current user in rank, THE Loss_Notification_Engine SHALL create a "passed by" notification with the passer's username and the user's new rank.
2. WHEN a user's rank drops by 3 or more positions, THE Loss_Notification_Engine SHALL create a "rank drop" notification with the number of positions lost and the new rank.
3. WHEN a user's daily streak is 4 hours from expiring, THE Loss_Notification_Engine SHALL create a "streak risk" notification with the remaining time and streak length.
4. WHILE monitoring rank changes, THE Loss_Notification_Engine SHALL check for rank movements via a background job at a maximum interval of 5 minutes.
5. THE Loss_Notification_Engine SHALL enforce a rate limit of a maximum of 3 loss-type notifications per user per 24-hour window.
6. WHEN a loss notification is created, THE Loss_Notification_Engine SHALL include a CTA deep link to the relevant page (e.g., boost page for rank drops).

### Requirement 13: Influence Graph (Network Visualization)

**User Story:** As a user with referrals, I want to see a visual representation of my referral network and its total value, so that I feel ownership over my growing influence.

#### Acceptance Criteria

1. WHEN the Influence_Graph loads, THE Influence_Graph SHALL fetch the user's referral tree from the Backend_API and render it as a radial or tree graph with the user at the center.
2. WHEN the Influence_Graph renders, THE Influence_Graph SHALL display aggregate stats including total network size, direct referrals count, network value in ETH, and growth rate.
3. THE Influence_Graph SHALL ensure that the displayed `directReferrals` count matches the count of referral records where the user is the referrer and the referral status is `registered` or `converted`.
4. WHEN the Influence_Graph renders individual nodes, THE Influence_Graph SHALL show each referral's avatar, username, activity status (active in last 7 days), and highlight the most valuable referrals.

### Requirement 14: Event Indexer Consistency

**User Story:** As a platform operator, I want on-chain events to be reliably synced to the database, so that the backend remains the authoritative source of truth for all transaction data.

#### Acceptance Criteria

1. WHEN a FriendPass mint event or tip event occurs on-chain, THE Event_Indexer SHALL create the corresponding database record within 30 seconds.
2. THE Event_Indexer SHALL poll chain events at an interval of 5-10 seconds to detect new FriendPass mints and tip transactions.
3. WHEN the Event_Indexer detects a FriendPass mint, THE Event_Indexer SHALL create a `friend_shares` record, record `reputation_event` entries, and update the runner's `reputation_score`.

### Requirement 15: Reputation Consistency

**User Story:** As a user performing positive actions, I want my reputation score to increase reliably, so that my contributions are accurately reflected.

#### Acceptance Criteria

1. WHEN a `reputation_event` with a positive weight is recorded, THE Backend_API SHALL ensure the user's `reputation_score` after the event is greater than or equal to the score before the event.
2. THE Backend_API SHALL ensure that a user's `reputation_score` is never less than 0.0.
3. WHEN a reputation-affecting action occurs (signup, FriendPass purchase, referral conversion, tip), THE Backend_API SHALL create a `reputation_event` row with `event_type`, `weight`, and optional `event_metadata`.

### Requirement 16: Security and Anti-Abuse

**User Story:** As a platform operator, I want the system to prevent abuse including self-referrals, whale accumulation, bot signups, and referral farming, so that the economy remains fair.

#### Acceptance Criteria

1. THE Backend_API SHALL generate referral codes using cryptographically random values that are not sequential or guessable.
2. THE Backend_API SHALL enforce rate limiting on the `/onboarding/register` endpoint using Redis to prevent bot signups.
3. THE Backend_API SHALL verify Privy JWT tokens server-side on every authenticated API call.
4. THE Backend_API SHALL cap referral rewards per time period to prevent referral farming.
5. THE Backend_API SHALL validate claimed usernames against reserved words and existing subdomains before allowing identity claims.
