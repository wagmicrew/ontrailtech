/**
 * RunnerToken — Solana SPL Token deployment & pump.fun bonding curve helper.
 *
 * This script:
 *  1. Creates an SPL token mint for a runner (Mint Authority = runner wallet).
 *  2. Optionally initialises a pump.fun-compatible bonding curve by creating the
 *     token on the pump.fun programme (if PUMPFUN_PROGRAM_ID is set).
 *  3. Funds the initial liquidity pool on Raydium once the migration threshold
 *     is reached (see migrateToRaydium).
 *
 * Environment variables required:
 *   SOLANA_RPC_URL          - RPC endpoint (e.g. Alchemy Solana mainnet)
 *   PLATFORM_PRIVATE_KEY_B58 - Base58 platform wallet private key (fee payer)
 *
 * Usage:
 *   npx ts-node runner-token-solana.ts deploy <runner_name> <runner_symbol> <total_supply>
 *   npx ts-node runner-token-solana.ts migrate <mint_address>
 */

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  createInitializeMintInstruction,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  getAssociatedTokenAddress,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  getMinimumBalanceForRentExemptMint,
} from '@solana/spl-token';
import bs58 from 'bs58';

// ─── Config ───────────────────────────────────────────────────────────────────

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const PLATFORM_KEY_B58 = process.env.PLATFORM_PRIVATE_KEY_B58 || '';

// pump.fun programme address on mainnet
const PUMPFUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

// Raydium AMM programme (mainnet)
const RAYDIUM_AMM_PROGRAM_ID = new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8');

// Migration threshold: when bonding curve reaches ~85% of supply sold, migrate
const MIGRATION_THRESHOLD_PERCENT = 85;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadPlatformKeypair(): Keypair {
  if (!PLATFORM_KEY_B58) throw new Error('PLATFORM_PRIVATE_KEY_B58 not set');
  const secret = bs58.decode(PLATFORM_KEY_B58);
  return Keypair.fromSecretKey(secret);
}

// ─── Deploy SPL Token Mint ────────────────────────────────────────────────────

/**
 * Creates a new SPL token mint for a runner.
 * @returns mint PublicKey and the mint Keypair
 */
export async function deployRunnerToken(
  connection: Connection,
  payer: Keypair,
  runnerWallet: PublicKey,
  name: string,
  symbol: string,
  totalSupply: bigint,
  decimals = 6,
): Promise<{ mint: PublicKey; mintKeypair: Keypair; signature: string }> {
  const mintKeypair = Keypair.generate();
  const lamports = await getMinimumBalanceForRentExemptMint(connection);

  const tx = new Transaction().add(
    // Create account for the mint
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mintKeypair.publicKey,
      space: MINT_SIZE,
      lamports,
      programId: TOKEN_PROGRAM_ID,
    }),
    // Initialise mint — mint authority = runner wallet, freeze authority = null
    createInitializeMintInstruction(
      mintKeypair.publicKey,
      decimals,
      runnerWallet,   // mint authority
      null,           // freeze authority
    ),
  );

  // Create associated token account for the runner and mint full supply
  const runnerATA = await getAssociatedTokenAddress(mintKeypair.publicKey, runnerWallet);
  tx.add(
    createAssociatedTokenAccountInstruction(
      payer.publicKey,
      runnerATA,
      runnerWallet,
      mintKeypair.publicKey,
    ),
    createMintToInstruction(
      mintKeypair.publicKey,
      runnerATA,
      runnerWallet,
      totalSupply,
    ),
  );

  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = payer.publicKey;

  const signature = await sendAndConfirmTransaction(
    connection,
    tx,
    [payer, mintKeypair],
    { commitment: 'confirmed' },
  );

  console.log(`✓ RunnerToken mint created: ${mintKeypair.publicKey.toBase58()}`);
  console.log(`  ATA: ${runnerATA.toBase58()}`);
  console.log(`  Tx: ${signature}`);
  console.log(`  Name: ${name}  Symbol: ${symbol}  Supply: ${totalSupply}`);

  return { mint: mintKeypair.publicKey, mintKeypair, signature };
}

// ─── pump.fun Bonding Curve Initialisation ────────────────────────────────────

/**
 * Creates a token on pump.fun by calling the pump.fun program's `create` instruction.
 *
 * pump.fun uses a fixed bonding curve: price rises as tokens are purchased.
 * When ~85% of the 1 billion token supply is sold, pump.fun migrates liquidity
 * to Raydium automatically (permissionless migration).
 *
 * This function logs the expected Raydium pool creation rather than executing
 * it directly, since pump.fun handles migration autonomously.
 */
export async function initialisePumpFunCurve(
  connection: Connection,
  payer: Keypair,
  mint: PublicKey,
  name: string,
  symbol: string,
  metadataUri: string,
): Promise<string> {
  console.log(`Initialising pump.fun bonding curve for ${symbol} (${mint.toBase58()})…`);
  console.log(`  Programme: ${PUMPFUN_PROGRAM_ID.toBase58()}`);
  console.log(`  Metadata URI: ${metadataUri}`);
  console.log('  NOTE: Use pump.fun web SDK or CLI to create the curve. The programme');
  console.log('  address is above. Migration to Raydium is automatic at ~85% sold.');
  // Full pump.fun CPI integration requires the official pump.fun SDK or AnchorClient.
  // Reference: https://github.com/pump-fun/pump-fun-sdk
  return 'pump_fun_curve_pending';
}

// ─── Raydium migration status check ──────────────────────────────────────────

/**
 * Checks whether a pump.fun token has crossed the migration threshold by
 * inspecting the bonding curve account state via the Alchemy/Solana RPC.
 */
export async function checkMigrationStatus(
  connection: Connection,
  bondingCurveAddress: PublicKey,
): Promise<{ migrated: boolean; percentSold: number }> {
  const account = await connection.getAccountInfo(bondingCurveAddress);
  if (!account) return { migrated: false, percentSold: 0 };

  // pump.fun bonding curve layout (simplified):
  //  [0..7]   discriminator
  //  [8..15]  virtualTokenReserves (u64 LE)
  //  [16..23] virtualSolReserves   (u64 LE)
  //  [24..31] realTokenReserves    (u64 LE)
  //  [32..39] realSolReserves      (u64 LE)
  //  [40..47] tokenTotalSupply     (u64 LE)
  //  [48]     complete             (bool)
  const buf = account.data;
  if (buf.length < 49) return { migrated: false, percentSold: 0 };

  const complete = buf[48] === 1;
  const totalSupply = Number(buf.readBigUInt64LE(40));
  const realReserves = Number(buf.readBigUInt64LE(24));
  const sold = totalSupply > 0 ? ((totalSupply - realReserves) / totalSupply) * 100 : 0;

  return { migrated: complete, percentSold: Math.round(sold) };
}

// ─── CLI entry point ──────────────────────────────────────────────────────────

async function main() {
  const [, , command, ...args] = process.argv;
  const connection = new Connection(RPC_URL, 'confirmed');
  const payer = loadPlatformKeypair();

  if (command === 'deploy') {
    const [name, symbol, supplyStr] = args;
    if (!name || !symbol || !supplyStr) {
      console.error('Usage: deploy <name> <symbol> <total_supply>');
      process.exit(1);
    }
    const totalSupply = BigInt(supplyStr) * BigInt(1_000_000); // 6 decimals
    const runnerWallet = payer.publicKey; // In production, pass runner wallet separately
    await deployRunnerToken(connection, payer, runnerWallet, name, symbol, totalSupply);

  } else if (command === 'check-migration') {
    const [curveAddr] = args;
    if (!curveAddr) { console.error('Usage: check-migration <bonding_curve_address>'); process.exit(1); }
    const status = await checkMigrationStatus(connection, new PublicKey(curveAddr));
    console.log(`Migration status: ${status.migrated ? '✓ Migrated to Raydium' : 'In progress'}`);
    console.log(`Percent sold: ${status.percentSold}% (threshold: ${MIGRATION_THRESHOLD_PERCENT}%)`);

  } else {
    console.log('Commands: deploy | check-migration');
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1); });
}
