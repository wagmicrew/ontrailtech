require("@nomicfoundation/hardhat-toolbox");

module.exports = {
  solidity: {
    version: "0.8.26",
    settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "cancun" },
  },
  networks: {
    hardhat: {},
    localhost: { url: "http://127.0.0.1:8545" },
    // Base Mainnet (Alchemy RPC)
    base: {
      url: process.env.ALCHEMY_BASE_RPC || "https://base-mainnet.g.alchemy.com/v2/" + (process.env.ALCHEMY_API_KEY || ""),
      accounts: process.env.PLATFORM_PRIVATE_KEY ? [process.env.PLATFORM_PRIVATE_KEY] : [],
      chainId: 8453,
    },
    // Base Sepolia testnet
    "base-sepolia": {
      url: process.env.ALCHEMY_BASE_SEPOLIA_RPC || "https://base-sepolia.g.alchemy.com/v2/" + (process.env.ALCHEMY_API_KEY || ""),
      accounts: process.env.PLATFORM_PRIVATE_KEY ? [process.env.PLATFORM_PRIVATE_KEY] : [],
      chainId: 84532,
    },
    // Ethereum Sepolia testnet
    sepolia: {
      url: process.env.ALCHEMY_SEPOLIA_RPC || "https://eth-sepolia.g.alchemy.com/v2/" + (process.env.ALCHEMY_API_KEY || ""),
      accounts: process.env.PLATFORM_PRIVATE_KEY ? [process.env.PLATFORM_PRIVATE_KEY] : [],
      chainId: 11155111,
    },
  },
  etherscan: {
    apiKey: {
      base: process.env.BASESCAN_API_KEY || "",
      mainnet: process.env.ETHERSCAN_API_KEY || "",
    },
    customChains: [
      {
        network: "base",
        chainId: 8453,
        urls: {
          apiURL: "https://api.basescan.org/api",
          browserURL: "https://basescan.org",
        },
      },
    ],
  },
};

