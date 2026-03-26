const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  // 1. Treasury
  const Treasury = await hre.ethers.getContractFactory("Treasury");
  const treasury = await Treasury.deploy();
  await treasury.waitForDeployment();
  console.log("Treasury:", await treasury.getAddress());

  // 2. POI NFT
  const POINFT = await hre.ethers.getContractFactory("POINFT");
  const poiNft = await POINFT.deploy();
  await poiNft.waitForDeployment();
  console.log("POINFT:", await poiNft.getAddress());

  // 3. Route NFT
  const RouteNFT = await hre.ethers.getContractFactory("RouteNFT");
  const routeNft = await RouteNFT.deploy();
  await routeNft.waitForDeployment();
  console.log("RouteNFT:", await routeNft.getAddress());

  // 4. Bonding Curve (base: 0.001 ETH, k: 0.0001 ETH)
  const BondingCurve = await hre.ethers.getContractFactory("BondingCurve");
  const bc = await BondingCurve.deploy(
    hre.ethers.parseEther("0.001"),
    hre.ethers.parseEther("0.0001")
  );
  await bc.waitForDeployment();
  console.log("BondingCurve:", await bc.getAddress());

  // 5. FriendShares
  const FriendShares = await hre.ethers.getContractFactory("FriendShares");
  const fs = await FriendShares.deploy();
  await fs.waitForDeployment();
  console.log("FriendShares:", await fs.getAddress());

  // 6. TGE Factory
  const TGEFactory = await hre.ethers.getContractFactory("TGEFactory");
  const tge = await TGEFactory.deploy(await treasury.getAddress(), deployer.address);
  await tge.waitForDeployment();
  console.log("TGEFactory:", await tge.getAddress());
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
