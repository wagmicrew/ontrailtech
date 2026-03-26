# OnTrail Product Overview

OnTrail is a Web3 SocialFi platform for runners, hikers, and trail explorers — a token launcher + reputation system disguised as a fitness social app.

## Core Thesis

- Every user = wallet
- Every profile = investable asset
- Every action = measurable value
- Every token = market-driven

## Key Principles

1. Onboarding UX (frictionless, Web2 users welcome)
2. Token loop (bonding curves, TGE, trading)
3. Anti-cheat system (GPS validation, device attestation)
4. Everything else is secondary

## Identity System

- Primary: Privy (email/social login → embedded wallet)
- Secondary: ConnectKit (external wallets like MetaMask)
- Even users without wallets can use the platform
- Each user gets: wallet address, profile, reputation score

## Key Features

- POI discovery and minting with rarity-based scarcity (Common, Rare, Epic, Legendary)
- Route NFTs for completed trails
- Runner profile system with subdomain routing (runnername.ontrail.tech)
- Explorer reputation engine (POIs, routes, network, token impact)
- Runner tokens with bonding curve mechanics (ERC-20 on Base)
- FriendPass social investment system
- Token Generation Events (TGE) → Uniswap v3 on Base
- H3 grid-based POI scarcity engine

## Token System (CORE)

Each runner has a personal ERC-20 token:
- Created via Factory Contract
- Bonding curve for continuous buying (deposit ETH on Base, receive tokens)
- Price increases as supply grows
- Distribution: % to runner, % to treasury, % retained in curve
- TGE triggers when market cap or liquidity threshold reached
- Deploys liquidity pool on Uniswap v3 (Base)

## Architecture

```
Users (Web/Mobile)
  ↓
Privy Auth + ConnectKit
  ↓
Nginx Gateway
  ↓
FastAPI API (Python)
  ↓
Data Gateway | Map Engines | Blockchain (Base)
  ↓
Reputation Engine
  ↓
Token Economy / TGE (Uniswap v3)
```

## Domains

- ontrail.tech - landing page
- app.ontrail.tech - web app
- api.ontrail.tech - API server
- *.ontrail.tech - wildcard for runner profiles

## MVP Scope

Launch with: Privy onboarding, bonding curve tokens, basic POIs (off-chain), profile system, token trading.
Exclude: DAO governance, ZK identity, complex rarity logic.
