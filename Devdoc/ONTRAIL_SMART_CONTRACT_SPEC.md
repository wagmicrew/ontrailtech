# ONTRAIL_SMART_CONTRACT_SPEC

Smart contract specification for the OnTrail Web3 platform.

This document defines the core contracts required for the OnTrail token
and POI ecosystem.

Contracts covered:

-   POI NFT
-   Route NFT
-   RunnerToken
-   BondingCurve
-   FriendShares
-   TGEFactory
-   Treasury
-   Governance hooks

------------------------------------------------------------------------

# 1. POI NFT CONTRACT

Standard: ERC721

Purpose: Represents a minted Point of Interest discovered by a runner.

Key fields:

-   tokenId
-   name
-   latitude
-   longitude
-   rarity
-   owner
-   mintedAt

Core functions:

mintPOI(name, lat, lon, rarity)

transferFrom()

ownerOf()

Metadata example:

{ "name": "Mountain Summit", "rarity": "Epic", "location": \[lat, lon\]
}

Rules:

-   Only valid POI grid slot may mint
-   Minting triggered via backend validation
-   NFT permanently public

------------------------------------------------------------------------

# 2. ROUTE NFT CONTRACT

Standard: ERC721

Represents completed or discovered routes.

Fields:

-   routeId
-   creator
-   distance
-   difficulty
-   poi_list

Functions:

mintRoute()

completeRoute()

Routes become public when minted.

------------------------------------------------------------------------

# 3. RUNNER TOKEN CONTRACT

Standard: ERC20

Represents the social token for a runner.

Fields:

-   name
-   symbol
-   totalSupply
-   runnerAddress

Functions:

mint()

transfer()

approve()

Used after Token Generation Event.

------------------------------------------------------------------------

# 4. BONDING CURVE CONTRACT

Purpose: Manages early investment phase for runner tokens.

Formula:

price = base + k \* supply²

Example:

base = 0.01 k = 0.000002

Functions:

buyShares()

sellShares()

currentPrice()

Triggers TGE when pool threshold reached.

------------------------------------------------------------------------

# 5. FRIEND SHARES CONTRACT

Tracks investments between runners.

Fields:

-   owner
-   runner
-   shares

Functions:

buyFriendShares()

sellFriendShares()

getShareBalance()

When runner token launches, friend share holders receive allocation.

------------------------------------------------------------------------

# 6. TGE FACTORY

Responsible for launching runner tokens.

Functions:

deployRunnerToken()

createLiquidityPool()

distributeAllocations()

Distribution example:

Runner: 35% Friend Pool: 20% LP: 25% DAO: 10% Platform: 10%

------------------------------------------------------------------------

# 7. TREASURY CONTRACT

Stores protocol funds.

Sources:

-   mint fees
-   token launch fees
-   marketplace fees

Functions:

deposit()

withdraw()

allocateRewards()

------------------------------------------------------------------------

# 8. GOVERNANCE INTEGRATION

Contracts must support DAO governance.

Roles:

-   SuperFounder
-   FounderDAO

Capabilities:

-   adjust bonding curve parameters
-   update protocol treasury
-   approve upgrades

------------------------------------------------------------------------

# 9. SECURITY REQUIREMENTS

Contracts must include:

-   reentrancy protection
-   overflow protection
-   pausability
-   upgrade safety checks

Recommended libraries:

OpenZeppelin contracts.

------------------------------------------------------------------------

# 10. DEPLOYMENT ORDER

1.  Treasury
2.  POI NFT
3.  Route NFT
4.  BondingCurve
5.  FriendShares
6.  RunnerToken template
7.  TGEFactory

------------------------------------------------------------------------

# 11. AI IMPLEMENTATION NOTES

AI coding agents should:

1.  generate Solidity contracts
2.  create deployment scripts
3.  write tests
4.  deploy to testnet
5.  integrate with backend APIs
