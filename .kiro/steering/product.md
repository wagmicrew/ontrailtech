# OnTrail Product Overview

OnTrail is a Web3 Social-Fi platform for runners, hikers, and trail explorers.

## Core Concept

Users discover real-world Points of Interest (POIs), mint them as NFTs, complete routes, build reputation, and participate in runner-based token economies.

## Key Features

- POI discovery and minting with rarity-based scarcity (Common, Rare, Epic, Legendary)
- Route NFTs for completed trails
- Runner profile system with subdomain routing (runnername.ontrail.tech)
- Explorer reputation engine based on POIs owned, routes created, friend network, and token impact
- FriendPass social investment system
- Runner tokens with bonding curve mechanics
- Token Generation Events (TGE) and DEX launches
- DAO governance model
- H3 grid-based POI scarcity engine

## Architecture

```
Users (Web/Mobile)
  ↓
Nginx Gateway
  ↓
FastAPI API
  ↓
Data Gateway | Map Engines | Blockchain
  ↓
Reputation Engine
  ↓
Token Economy / TGE
```

## Domains

- ontrail.tech - landing page
- app.ontrail.tech - mobile app
- api.ontrail.tech - API server
- data.ontrail.tech - secure database
- *.ontrail.tech - wildcard for runner profiles
