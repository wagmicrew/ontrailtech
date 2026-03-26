# OnTrail AI Developer Guide

This guide helps AI coding systems scaffold and implement the OnTrail
platform.

------------------------------------------------------------------------

## Step 1 -- Repository Structure

    ontrail/
     apps/
       web/
       mobile/
     services/
       api/
       data/
     contracts/
     infra/
     scripts/
     docs/

------------------------------------------------------------------------

## Step 2 -- Infrastructure Setup

Required components:

-   Nginx reverse proxy
-   PM2 service manager
-   PostgreSQL database
-   Redis cache
-   Mapbox map tiles

------------------------------------------------------------------------

## Step 3 -- Database Schema

Core tables:

-   users
-   wallets
-   pois
-   routes
-   route_nfts
-   grid_cells
-   poi_slots
-   checkins
-   runner_tokens
-   friend_shares
-   token_pools
-   steps
-   fraud_events
-   translations
-   acl_roles

------------------------------------------------------------------------

## Step 4 -- Backend API

FastAPI endpoints:

    POST /auth/login
    GET /users/{id}
    GET /poi/nearby
    POST /poi/mint
    POST /checkin
    POST /token/buy
    POST /token/sell
    GET /runner/{username}
    POST /admin/config

------------------------------------------------------------------------

## Step 5 -- Smart Contracts

Contracts required:

-   POI NFT (ERC721)
-   Runner Token (ERC20)
-   BondingCurve
-   FriendShares
-   TGEFactory

Deployment order:

1.  BondingCurve
2.  POI NFT
3.  Runner Token Factory
4.  TGE Factory

------------------------------------------------------------------------

## Step 6 -- Map Engine

Use H3 grid for global map segmentation.

Responsibilities:

-   POI scarcity control
-   trail discovery clustering
-   route generation

------------------------------------------------------------------------

## Step 7 -- GPS Anti-Cheat

Validate:

-   GPS movement
-   accelerometer data
-   step cadence
-   route continuity
-   device attestation

------------------------------------------------------------------------

## Step 8 -- Testing

Vitest structure:

    tests/
     bondingCurve.test.ts
     poiGrid.test.ts
     tokenSimulator.test.ts
     gpsValidation.test.ts

------------------------------------------------------------------------

## Step 9 -- Admin Simulation Tools

Admin Token Playbook must simulate:

-   bonding curve behavior
-   investor growth
-   liquidity pool size
-   token distribution

------------------------------------------------------------------------

## Step 10 -- Deployment

Production services:

-   ontrail.tech
-   app.ontrail.tech
-   api.ontrail.tech
-   data.ontrail.tech

Wildcard subdomain routing:

    *.ontrail.tech → runner profiles

------------------------------------------------------------------------

## Goal

Enable AI systems to automatically scaffold the OnTrail platform and
generate working code modules.
