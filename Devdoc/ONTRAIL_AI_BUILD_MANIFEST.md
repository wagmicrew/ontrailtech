# OnTrail AI Build Manifest

## Project

OnTrail -- Web3 Social-Fi platform for runners, hikers and trail
explorers.

Users discover real-world Points of Interest (POIs), mint them as NFTs,
complete routes, build reputation, and participate in runner-based token
economies.

------------------------------------------------------------------------

## System Architecture

Users (Web / Mobile) ↓ Nginx Gateway ↓ FastAPI API ↓ Data Gateway \| Map
Engines \| Blockchain ↓ Reputation Engine ↓ Token Economy / TGE

------------------------------------------------------------------------

## Domains

-   ontrail.tech -- landing
-   www.ontrail.tech -- redirect
-   app.ontrail.tech -- mobile app
-   api.ontrail.tech -- API
-   data.ontrail.tech -- secure DB
-   runnername.ontrail.tech -- runner profiles

Wildcard DNS:

    *.ontrail.tech

------------------------------------------------------------------------

## Core Modules

-   POI discovery and minting
-   Route NFTs
-   Runner profiles
-   Explorer reputation
-   FriendPass social investment
-   Runner tokens
-   Token Generation Events
-   DAO governance
-   Map explorer

------------------------------------------------------------------------

## POI Scarcity Engine

World divided using H3 grid.

Example rule:

    grid_cell:
      max_pois: 3
      rarity:
        common: 2
        rare: 1

Rarity tiers:

-   Common
-   Rare
-   Epic
-   Legendary

------------------------------------------------------------------------

## Explorer Reputation

Reputation derived from:

-   POIs owned
-   Routes created
-   Friend network reputation
-   Tokens generated

Example formula:

    reputation =
     (POIs * 2)
     + (Routes * 3)
     + (FriendReputation * 0.5)
     + (TokenImpact * 2)

------------------------------------------------------------------------

## Token Economy

Runner tokens follow lifecycle:

Create Runner → Buy Shares → Bonding Curve → TGE → DEX Launch

Bonding curve example:

    price = base + k * supply²

------------------------------------------------------------------------

## Admin Systems

Admin modules:

-   POI grid configuration
-   Token curve configuration
-   Reputation weighting
-   Token playbook simulator
-   Localization manager
-   Fraud detection

------------------------------------------------------------------------

## Technology Stack

Frontend: - React - Vite - Tailwind - i18next

Mobile: - Expo - React Native

Backend: - FastAPI - PostgreSQL - Redis

Web3: - Solidity - ethers.js - wagmi

Testing: - Vitest
