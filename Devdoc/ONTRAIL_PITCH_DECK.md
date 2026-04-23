# OnTrail — Grant & Funding Pitch

> **The Web3 Onboarding Layer for 450 Million Runners**
> [ontrail.tech](https://ontrail.tech)

---

## One-Line Pitch

> *OnTrail onboards the next million Web3 users by making their existing behavior — running and exploring the outdoors — the entry point. No seed phrases. No gas tutorials. Just run, discover, own.*

---

## The Problem

Outdoor sports — running, hiking, trail exploration — are fundamentally **community activities** with a massive global following (450M+ runners worldwide), yet the industry has no meaningful digital ownership layer:

- Athletes create enormous value (discovering trails, curating routes, building local knowledge) but capture **none of it economically**
- Trail data is siloed in closed platforms (Strava, AllTrails) where users have zero ownership over their contributions
- There is **no financial incentive** for community members to improve map data, validate routes, or build local running culture
- Emerging athletes and influencers in running have no capital formation tools beyond sponsorship deals that only reach elite performers
- **Web3 onboarding has stalled** — existing crypto applications require users to already care about crypto. OnTrail removes that prerequisite entirely.

---

## The Solution: OnTrail

OnTrail is a **location-based, Web3-native platform** that turns real-world outdoor exploration into digital ownership and community-driven token economies.

Runners and hikers:
1. **Discover** Points of Interest (POIs) in the real world
2. **Mint** them as scarce NFTs on-chain — permanently attributed to the explorer
3. **Complete routes** and earn on-chain reputation
4. **Issue runner tokens** — personal social tokens backed by a bonding curve — enabling fans and communities to invest in athletes they believe in
5. **Govern** the ecosystem through DAO mechanisms

---

## Why OnTrail Is a Web3 Onboarding Machine

This is OnTrail's most important ecosystem contribution — and the core of our grant argument.

### 1. Zero-crypto entry point
Users start as **runners**, not crypto users. They open a map, find a trail, tap a POI. Privy handles wallet creation silently in the background. By the time they hold an NFT, they never consciously "did crypto" — they just went for a run. This is the lowest-friction onboarding path in the ecosystem.

### 2. Intrinsic motivation inverts the loop
Most Web3 onboarding fails because the activity *is* the token speculation. OnTrail inverts this: running and hiking have **standalone real-world value**. Token rewards sit on top of that, not underneath it. Users stay when token prices fall, because they were runners first.

### 3. Social graph as trust bridge
The FriendShares mechanic means users onboard *through people they already follow*. Buying shares in a runner you admire is a familiar social action (think Patreon, not DeFi). It pulls in audiences that would never self-onboard through a DEX or a bridge.

### 4. Geographic scarcity teaches Web3 intuitively
When a user mints a POI at a mountain summit they just climbed, they immediately understand **scarcity, ownership, and provenance** — the three hardest concepts in Web3 — without a single tutorial or explainer.

### 5. Open geodata as a lasting public good
Every POI and route minted is community-contributed geographic data stored on-chain. OnTrail users are building an **open, verifiable map layer** as a side effect of exercising. This data has value independent of any token price.

---

## Core Technology Stack

| Layer | Technology |
|---|---|
| Mobile app | React Native / Expo |
| Web app | React + Vite + TailwindCSS |
| Backend API | Python FastAPI |
| Database | PostgreSQL + Redis |
| Map Engine | H3 hexagonal grid (Uber) + Mapbox |
| Smart Contracts | Solidity (ERC-20, ERC-721) |
| Auth | Privy (Web3-native, embedded wallets) |
| Infrastructure | Nginx, PM2, Ubuntu VPS |

All code is **production-deployed** at [ontrail.tech](https://ontrail.tech) with a live mobile app, functioning API, and deployable smart contracts.

---

## Unique Mechanics

### POI Scarcity Engine
The world is divided using Uber's **H3 hexagonal grid**. Each grid cell has a capped number of mintable POIs across rarity tiers (Common → Rare → Epic → Legendary). Early explorers capture scarce, appreciating assets — rewarding real-world discovery over speculation.

### Bonding Curve Token Economy
Every runner can launch a personal **ERC-20 token** whose price follows a bonding curve:

$$price = base + k \times supply^2$$

Early supporters of a runner are rewarded as the runner grows. TGE events graduate successful runner tokens to DEX trading with a self-sustaining price mechanism.

### FriendPass Social Investment
Users buy **shares** in other athletes (FriendShares contract), creating a social investment graph that aligns financial incentives with community support — not zero-sum speculation.

### Explorer Reputation
On-chain reputation accumulates from verified real-world activity:

$$reputation = (POIs \times 2) + (Routes \times 3) + (FriendRep \times 0.5) + (TokenImpact \times 2)$$

---

## Market Opportunity

| Segment | Size |
|---|---|
| Global running market | $45B+ (2024) |
| NFT gaming / GameFi | $10B+ |
| Move-to-Earn (M2E) sector | $3B+ established user base |
| Trail running (fastest growing outdoor sport) | 50M+ participants globally |

OnTrail sits at the intersection of **outdoor fitness + Web3 + social tokens** — a segment with no dominant player and a built-in reason to participate that doesn't require crypto conviction.

---

## Traction & Live Product

- **Live web app** at [app.ontrail.tech](https://app.ontrail.tech)
- **Mobile app** (Expo / React Native) built and deployable to iOS and Android
- **Production API** at [api.ontrail.tech](https://api.ontrail.tech) with authentication, POI, route, token, and admin systems
- **Smart contracts** compiled and deployable: POI NFT, Route NFT, RunnerToken, BondingCurve, FriendShares, TGEFactory, Treasury
- **Full database schema**: users, wallets, POIs, routes, reputation, runner tokens, friend shares, fraud detection, ACL roles
- **Alembic migrations** — production-grade schema management

---

## Why Now

1. **Web3 infrastructure has matured** — L2 chains make micro-transactions viable for everyday users at near-zero cost
2. **Move-to-Earn proved product-market fit** — StepN reached 3M daily active users at peak, then failed due to unsustainable tokenomics. OnTrail fixes this with **real-world asset backing** (geographic scarcity + authentic route data) so the economy doesn't collapse when speculation cools
3. **Outdoor sports are booming** post-pandemic with record participation in trail running and hiking globally
4. **The onboarding problem is now the #1 blocker** for Web3 growth — OnTrail is a structural solution, not a campaign

---

## Funding Use

| Allocation | % | Purpose |
|---|---|---|
| Protocol Development | 35% | Smart contract audit, L2 deployment, token launch infrastructure |
| Mobile App Launch | 20% | App Store / Play Store submission, push notifications, GPS engine |
| Community & Ecosystem | 20% | Initial runner token incentive programs, ambassador grants |
| Infrastructure & Security | 15% | Server scaling, security audits, CDN |
| Legal & Compliance | 10% | Token legal structure, DAO formation, IP protection |

---

## Grant Targets

### Tier 1 — Strongest Fit

| Grantor | Program | Why OnTrail fits | Typical size | Apply at |
|---|---|---|---|---|
| **Optimism Foundation** | RetroPGF (Retro Public Goods Funding) | Open trail geodata is a genuine public good; mass onboarding of non-crypto users directly serves Optimism's growth mandate | $10K–$500K+ | [app.optimism.io/retropgf](https://app.optimism.io/retropgf) |
| **Ethereum Foundation** | Ecosystem Support Programme (ESP) | Novel NFT use case for real-world geographic asset ownership; Privy embedded wallet onboarding research | $10K–$300K | [esp.ethereum.foundation](https://esp.ethereum.foundation) |
| **Base** (Coinbase) | Base Ecosystem Fund / Onchainsummer grants | Consumer onboarding is Base's explicit mission; OnTrail is a consumer app built for L2 | $25K–$250K | [base.org/ecosystem](https://base.org/ecosystem) |
| **Arbitrum Foundation** | LTIPP / Domain Allocator grants | DeFi-adjacent SocialFi with bonding curve primitives; runner token TGE liquidity pairs naturally on Arbitrum DEXs | $50K–$1M | [arbitrum.foundation/grants](https://arbitrum.foundation/grants) |

### Tier 2 — Strong Supporting Fit

| Grantor | Program | Why OnTrail fits | Typical size | Apply at |
|---|---|---|---|---|
| **Polygon** | Polygon Village / Community Grants | Low-fee L2 suits micro-transaction POI minting; existing mobile app ready | $10K–$100K | [polygon.technology/grants](https://polygon.technology/grants) |
| **Privy** | Builder grants / co-marketing | OnTrail is a showcase embedded wallet app — non-crypto users onboarded via Privy at scale | Varies | [privy.io](https://privy.io) — direct outreach |
| **OpenStreetMap Foundation** | Microgrants | Community-contributed geographic data; POI data enriches open map ecosystem | €1K–€20K | [osmfoundation.org/wiki/Microgrants](https://osmfoundation.org/wiki/Microgrants) |
| **Gitcoin** | Grants Stack (community rounds) | Open-source public goods track; outdoor community can vote-match | $5K–$50K | [grants.gitcoin.co](https://grants.gitcoin.co) |

### Tier 3 — Sports & Regional

| Grantor | Program | Why OnTrail fits |
|---|---|---|
| **Nordic sports councils** (Norsk Tipping, RF) | Innovation & digital sports grants | Trail running is a priority sport in Scandinavia; Norwegian-built project |
| **European Outdoor Group** | Sustainability & community programs | Trail data curation serves outdoor community sustainability goals |
| **World Athletics** | Innovation grants | Verified on-chain route completion supports official distance verification |
| **Chainlink BUILD** | Oracle integration program | GPS/fitness data oracle integration for verified route completion |

---

## The Onboarding Pitch (one paragraph for any application)

> *The single biggest blocker to Web3 mass adoption is not technology — it's motivation. Nobody wakes up wanting to own an NFT. But 450 million people wake up wanting to run. OnTrail meets them there: users create an embedded wallet the first time they tap a trail on the map, mint a POI at the summit they just climbed, and earn reputation for every kilometer logged. The token layer is a reward on top of an activity they already love. By the time they hold on-chain assets, they are Web3 users — they just became runners first. Every active OnTrail user is a net-new wallet in the ecosystem that no amount of exchange marketing or airdrop farming could have reached.*

---

## Team

*(Insert team bios — founders, advisors, relevant running/tech credentials)*

---

## Vision

OnTrail is building the **geographic ownership layer for outdoor sport**.

In five years:
- Every notable trail, summit, and hidden gem on Earth is an on-chain asset, discovered and owned by the explorer who found it first
- Runners at every level have capital formation tools previously only available to professional athletes
- A self-governing DAO controls the map economy, distributing protocol revenue back to the athletes who built it

**The trail is public. The discovery is yours.**

---

*Contact: [Insert contact] | ontrail.tech | GitHub: [Insert repo]*
