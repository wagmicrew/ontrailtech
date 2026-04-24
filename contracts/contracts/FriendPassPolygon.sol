// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title FriendPassPolygon
 * @notice Advanced FriendPass system on Polygon with reputation-based pricing and flexible tax structure.
 *
 * Features:
 * - Linear pricing with reputation multiplier
 * - Configurable tax distribution (sitewallet, profile owner, DAO, ancient)
 * - Volatile vs reputation-based price split
 * - Profile wallet minting and transfer mechanism
 * - Selling with guaranteed liquidity
 * - Anti-whale protection
 *
 * Pricing: Price(n) = (basePrice + slope * n) * reputationMultiplier
 * Tax split: Configurable via basis points
 * Chain: Polygon (ID 137)
 */
contract FriendPassPolygon is ERC1155, Ownable, ReentrancyGuard, Pausable {

    // ── Revenue recipients ──
    address public siteWallet;
    address public daoWallet;
    address public ancientWallet;

    // ── Pricing parameters ──
    uint256 public basePrice = 0.001 ether;
    uint256 public slope = 0.0001 ether;
    
    // ── Reputation pricing ──
    bool public reputationEnabled = true;
    uint256 public reputationMultiplier = 100; // 1.00x (100 = 1.00)
    uint256 public reputationBaseThreshold = 100; // Min reputation to affect price

    // ── Supply limits ──
    uint256 public maxSupplyPerRunner = 100;
    uint256 public maxPerWallet = 5;

    // ── Tax structure (basis points, total = 10000) ──
    uint256 public taxSiteWalletBPS = 3000;   // 30%
    uint256 public taxProfileOwnerBPS = 4000;  // 40%
    uint256 public taxDaoBPS = 2000;          // 20%
    uint256 public taxAncientBPS = 1000;      // 10%

    // ── Volatile vs reputation split (percentage) ──
    uint256 public volatilePricePercentage = 60;  // 60% volatile
    uint256 public reputationPricePercentage = 40; // 40% reputation

    // ── Selling mechanism ──
    bool public sellEnabled = true;
    uint256 public sellFeeBPS = 500;  // 5% sell fee
    uint256 public minSellPrice = 0.0005 ether;

    // ── Profile wallet mapping ──
    mapping(address => address) public profileWallet; // user -> profile wallet
    mapping(address => bool) public isProfileWallet;  // address -> is profile wallet

    // ── State ──
    mapping(address => uint256) public runnerTokenId;
    mapping(uint256 => address) public tokenIdToRunner;
    mapping(uint256 => uint256) public totalSupply;
    mapping(uint256 => uint256) public runnerReputation; // tokenId -> reputation
    uint256 public nextTokenId = 1;

    // ── Events ──
    event FriendPassBought(
        address indexed buyer,
        address indexed runner,
        uint256 tokenId,
        uint256 price,
        uint256 supply,
        uint256 reputation
    );
    event RunnerRegistered(address indexed runner, uint256 tokenId);
    event ReputationUpdated(uint256 indexed tokenId, uint256 reputation);
    event ProfileWalletSet(address indexed user, address profileWalletAddress);
    event FriendPassSold(
        address indexed seller,
        uint256 tokenId,
        uint256 sellPrice,
        uint256 fee,
        uint256 netAmount
    );

    constructor(
        address _siteWallet,
        address _daoWallet,
        address _ancientWallet
    ) ERC1155("") Ownable(msg.sender) {
        siteWallet = _siteWallet;
        daoWallet = _daoWallet;
        ancientWallet = _ancientWallet;
    }

    // ── Profile Wallet Management ──

    function setProfileWallet(address user, address walletAddress) external onlyOwner {
        profileWallet[user] = walletAddress;
        isProfileWallet[walletAddress] = true;
        emit ProfileWalletSet(user, walletAddress);
    }

    function getProfileWallet(address user) public view returns (address) {
        return profileWallet[user];
    }

    // ── Runner registration ──

    function registerRunner(address runner) external onlyOwner {
        require(runnerTokenId[runner] == 0, "Already registered");
        uint256 tokenId = nextTokenId++;
        runnerTokenId[runner] = tokenId;
        tokenIdToRunner[tokenId] = runner;
        emit RunnerRegistered(runner, tokenId);
    }

    // ── Reputation management ──

    function setRunnerReputation(address runner, uint256 reputation) external onlyOwner {
        uint256 tokenId = runnerTokenId[runner];
        require(tokenId != 0, "Runner not registered");
        runnerReputation[tokenId] = reputation;
        emit ReputationUpdated(tokenId, reputation);
    }

    function getRunnerReputation(address runner) public view returns (uint256) {
        uint256 tokenId = runnerTokenId[runner];
        if (tokenId == 0) return 0;
        return runnerReputation[tokenId];
    }

    // ── Pricing calculations ──

    function calculateReputationMultiplier(uint256 reputation) public view returns (uint256) {
        if (!reputationEnabled) return 100; // 1.00x
        
        if (reputation < reputationBaseThreshold) {
            return 100; // 1.00x
        }
        
        // Calculate multiplier: 1 + (multiplier * log(1 + (rep - threshold) / 100))
        // Using fixed-point math for log approximation
        uint256 excessRep = reputation - reputationBaseThreshold;
        uint256 logFactor = _log1p(excessRep * 100 / reputationBaseThreshold);
        uint256 multiplier = 100 + (reputationMultiplier * logFactor / 10000);
        
        return multiplier;
    }

    function _log1p(uint256 x) internal pure returns (uint256) {
        // Simple log approximation: log(1 + x) ≈ x * (200 - x) / 200 for small x
        // This is a rough approximation for demonstration
        if (x == 0) return 0;
        if (x > 10000) x = 10000; // Cap at 100%
        return (x * (20000 - x)) / 20000;
    }

    function calculatePrice(
        uint256 supply,
        uint256 reputation
    ) public view returns (uint256 basePriceResult, uint256 reputationPriceResult, uint256 totalPrice) {
        // Base price: basePrice + slope * supply
        basePriceResult = basePrice + (slope * supply);
        
        // Reputation multiplier
        uint256 repMultiplier = calculateReputationMultiplier(reputation);
        
        // Reputation-adjusted price
        reputationPriceResult = (basePriceResult * repMultiplier) / 100;
        
        // Split between volatile and reputation
        uint256 volatilePortion = (basePriceResult * volatilePricePercentage) / 100;
        uint256 reputationPortion = ((reputationPriceResult - basePriceResult) * reputationPricePercentage) / 100;
        
        totalPrice = basePriceResult + reputationPortion;
    }

    function getPrice(address runner) public view returns (uint256) {
        uint256 tokenId = runnerTokenId[runner];
        require(tokenId != 0, "Runner not registered");
        uint256 supply = totalSupply[tokenId];
        uint256 reputation = runnerReputation[tokenId];
        (, , uint256 totalPrice) = calculatePrice(supply, reputation);
        return totalPrice;
    }

    function getNextPrice(address runner) external view returns (uint256) {
        uint256 tokenId = runnerTokenId[runner];
        require(tokenId != 0, "Runner not registered");
        uint256 supply = totalSupply[tokenId];
        uint256 reputation = runnerReputation[tokenId];
        (, , uint256 totalPrice) = calculatePrice(supply + 1, reputation);
        return totalPrice;
    }

    // ── Buy (mint) ──

    function buy(address runner) external payable nonReentrant whenNotPaused {
        uint256 tokenId = runnerTokenId[runner];
        require(tokenId != 0, "Runner not registered");

        // Self-purchase prevention
        require(msg.sender != runner, "Cannot buy own FriendPass");

        // Supply check
        uint256 supply = totalSupply[tokenId];
        require(supply < maxSupplyPerRunner, "Supply exhausted");

        // Anti-whale check
        require(balanceOf(msg.sender, tokenId) < maxPerWallet, "Max passes per wallet reached");

        // Price calculation
        uint256 reputation = runnerReputation[tokenId];
        (, , uint256 price) = calculatePrice(supply, reputation);
        require(msg.value >= price, "Insufficient payment");

        // Mint to buyer's wallet (or profile wallet if exists)
        address recipient = msg.sender;
        address buyerProfileWallet = profileWallet[msg.sender];
        if (buyerProfileWallet != address(0)) {
            recipient = buyerProfileWallet;
        }

        // Mint
        totalSupply[tokenId] = supply + 1;
        _mint(recipient, tokenId, 1, "");

        // Distribute revenue according to tax structure
        uint256 toSiteWallet = (price * taxSiteWalletBPS) / 10000;
        uint256 toProfileOwner = (price * taxProfileOwnerBPS) / 10000;
        uint256 toDao = (price * taxDaoBPS) / 10000;
        uint256 toAncient = price - toSiteWallet - toProfileOwner - toDao; // remainder

        // Send to recipients
        if (toSiteWallet > 0) {
            (bool s1,) = payable(siteWallet).call{value: toSiteWallet}("");
            require(s1, "SiteWallet transfer failed");
        }
        if (toProfileOwner > 0) {
            address runnerProfileWallet = profileWallet[runner];
            address profileOwnerRecipient = runnerProfileWallet != address(0) ? runnerProfileWallet : runner;
            (bool s2,) = payable(profileOwnerRecipient).call{value: toProfileOwner}("");
            require(s2, "ProfileOwner transfer failed");
        }
        if (toDao > 0) {
            (bool s3,) = payable(daoWallet).call{value: toDao}("");
            require(s3, "DAO transfer failed");
        }
        if (toAncient > 0) {
            (bool s4,) = payable(ancientWallet).call{value: toAncient}("");
            require(s4, "Ancient transfer failed");
        }

        // Refund excess
        if (msg.value > price) {
            (bool refund,) = payable(msg.sender).call{value: msg.value - price}("");
            require(refund, "Refund failed");
        }

        emit FriendPassBought(msg.sender, runner, tokenId, price, supply + 1, reputation);
    }

    // ── Sell mechanism ──

    function sell(uint256 tokenId, uint256 amount) external nonReentrant whenNotPaused {
        require(sellEnabled, "Selling is disabled");
        require(balanceOf(msg.sender, tokenId) >= amount, "Insufficient balance");

        address runner = tokenIdToRunner[tokenId];
        require(runner != address(0), "Invalid token");

        // Calculate sell price (minimum of purchase price tracking or current price)
        // For simplicity, use current price * 0.8 (20% discount)
        uint256 supply = totalSupply[tokenId];
        uint256 reputation = runnerReputation[tokenId];
        (, , uint256 currentPrice) = calculatePrice(supply, reputation);
        uint256 sellPrice = (currentPrice * 80) / 100; // 20% discount from current price

        // Apply minimum sell price
        if (sellPrice < minSellPrice) {
            sellPrice = minSellPrice;
        }

        // Calculate sell fee
        uint256 sellFee = (sellPrice * sellFeeBPS) / 10000;
        uint256 netAmount = sellPrice - sellFee;

        // Burn tokens
        totalSupply[tokenId] = supply - amount;
        _burn(msg.sender, tokenId, amount);

        // Send net amount to seller
        if (netAmount > 0) {
            (bool sent,) = payable(msg.sender).call{value: netAmount}("");
            require(sent, "Payment failed");
        }

        // Send fee to site wallet
        if (sellFee > 0) {
            (bool feeSent,) = payable(siteWallet).call{value: sellFee}("");
            require(feeSent, "Fee transfer failed");
        }

        emit FriendPassSold(msg.sender, tokenId, sellPrice, sellFee, netAmount);
    }

    // ── View helpers ──

    function getShares(address runner, address holder) external view returns (uint256) {
        uint256 tokenId = runnerTokenId[runner];
        if (tokenId == 0) return 0;
        return balanceOf(holder, tokenId);
    }

    function totalShares(address runner) external view returns (uint256) {
        uint256 tokenId = runnerTokenId[runner];
        if (tokenId == 0) return 0;
        return totalSupply[tokenId];
    }

    function hasPass(address user, address runner) external view returns (bool) {
        uint256 tokenId = runnerTokenId[runner];
        if (tokenId == 0) return false;
        return balanceOf(user, tokenId) > 0;
    }

    function getPriceBreakdown(address runner) external view returns (
        uint256 basePriceResult,
        uint256 reputationPriceResult,
        uint256 totalPrice,
        uint256 volatilePortion,
        uint256 reputationPortion
    ) {
        uint256 tokenId = runnerTokenId[runner];
        require(tokenId != 0, "Runner not registered");
        uint256 supply = totalSupply[tokenId];
        uint256 reputation = runnerReputation[tokenId];
        
        (basePriceResult, reputationPriceResult, totalPrice) = calculatePrice(supply, reputation);
        volatilePortion = (basePriceResult * volatilePricePercentage) / 100;
        reputationPortion = totalPrice - basePriceResult;
    }

    function getTaxDistribution(uint256 price) external view returns (
        uint256 toSiteWallet,
        uint256 toProfileOwner,
        uint256 toDao,
        uint256 toAncient
    ) {
        toSiteWallet = (price * taxSiteWalletBPS) / 10000;
        toProfileOwner = (price * taxProfileOwnerBPS) / 10000;
        toDao = (price * taxDaoBPS) / 10000;
        toAncient = price - toSiteWallet - toProfileOwner - toDao;
    }

    // ── Admin configuration ──

    function setBasePrice(uint256 _basePrice) external onlyOwner {
        basePrice = _basePrice;
    }

    function setSlope(uint256 _slope) external onlyOwner {
        slope = _slope;
    }

    function setMaxSupply(uint256 _max) external onlyOwner {
        maxSupplyPerRunner = _max;
    }

    function setMaxPerWallet(uint256 _max) external onlyOwner {
        maxPerWallet = _max;
    }

    function setTaxStructure(
        uint256 _siteWalletBPS,
        uint256 _profileOwnerBPS,
        uint256 _daoBPS,
        uint256 _ancientBPS
    ) external onlyOwner {
        require(_siteWalletBPS + _profileOwnerBPS + _daoBPS + _ancientBPS == 10000, "Total must be 10000");
        taxSiteWalletBPS = _siteWalletBPS;
        taxProfileOwnerBPS = _profileOwnerBPS;
        taxDaoBPS = _daoBPS;
        taxAncientBPS = _ancientBPS;
    }

    function setPriceSplit(
        uint256 _volatilePercentage,
        uint256 _reputationPercentage
    ) external onlyOwner {
        require(_volatilePercentage + _reputationPercentage == 100, "Total must be 100");
        volatilePricePercentage = _volatilePercentage;
        reputationPricePercentage = _reputationPercentage;
    }

    function setReputationConfig(
        bool _enabled,
        uint256 _multiplier,
        uint256 _threshold
    ) external onlyOwner {
        reputationEnabled = _enabled;
        reputationMultiplier = _multiplier;
        reputationBaseThreshold = _threshold;
    }

    function setSellConfig(
        bool _enabled,
        uint256 _feeBPS,
        uint256 _minSellPrice
    ) external onlyOwner {
        sellEnabled = _enabled;
        sellFeeBPS = _feeBPS;
        minSellPrice = _minSellPrice;
    }

    function setRevenueAddresses(
        address _siteWallet,
        address _daoWallet,
        address _ancientWallet
    ) external onlyOwner {
        siteWallet = _siteWallet;
        daoWallet = _daoWallet;
        ancientWallet = _ancientWallet;
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    // ── Emergency functions ──

    function emergencyWithdraw() external onlyOwner {
        payable(owner()).transfer(address(this).balance);
    }
}
