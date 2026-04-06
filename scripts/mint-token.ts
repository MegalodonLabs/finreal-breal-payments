import {
  Connection,
  Keypair,
  PublicKey,
} from "@solana/web3.js";
import {
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";

// ─── Config ───────────────────────────────────────────────────────────────────

const TOKEN_DECIMALS   = 6;
const INITIAL_SUPPLY   = 1_000_000;          // 1,000,000 BREAL (human-readable)
const NETWORK          = "devnet";

// Private Triton One RPC — more reliable than the public devnet endpoint.
const RPC_URL =
  process.env.SOLANA_RPC_URL ?? "https://nyc252.nodes.rpcpool.com";

// ─── Wallet ───────────────────────────────────────────────────────────────────

function loadWallet(): Keypair {
  const keyPath = path.join(
    process.env.HOME || process.env.USERPROFILE || "~",
    ".config",
    "solana",
    "id.json"
  );

  if (!fs.existsSync(keyPath)) {
    throw new Error(
      `Wallet key file not found at ${keyPath}.\n` +
      `Run: solana-keygen new --outfile ~/.config/solana/id.json`
    );
  }

  const raw = fs.readFileSync(keyPath, "utf-8");
  const secretKey = Uint8Array.from(JSON.parse(raw));
  return Keypair.fromSecretKey(secretKey);
}

// ─── Load Mint Address ────────────────────────────────────────────────────────

function loadMintAddress(): PublicKey {
  const mintFile = path.join(__dirname, "..", "mint-address.json");

  if (!fs.existsSync(mintFile)) {
    throw new Error(
      `mint-address.json not found.\n` +
      `Run  npm run create-token  first to deploy the token mint.`
    );
  }

  const { mint } = JSON.parse(fs.readFileSync(mintFile, "utf-8"));
  return new PublicKey(mint);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🚀 Minting ${INITIAL_SUPPLY.toLocaleString()} BREAL on Solana ${NETWORK}...\n`);

  // Connect via Triton One private RPC
  const connection = new Connection(RPC_URL, "confirmed");
  console.log(`🌐 RPC endpoint      : ${RPC_URL}`);

  // Load wallet & mint
  const wallet   = loadWallet();
  const mintPubkey = loadMintAddress();

  console.log(`👛 Deployer wallet : ${wallet.publicKey.toBase58()}`);
  console.log(`🏷  Mint address   : ${mintPubkey.toBase58()}\n`);

  // Confirm the wallet still has SOL
  const balance = await connection.getBalance(wallet.publicKey);
  console.log(`💰 Wallet balance  : ${balance / 1e9} SOL`);
  if (balance === 0) {
    throw new Error(
      "Wallet has 0 SOL. Fund it first:\n  solana airdrop 2 --url devnet"
    );
  }

  // ── Step 1: Create (or fetch) the ATA ──────────────────────────────────────
  console.log(`\n🔑 Getting or creating Associated Token Account (ATA)...`);

  const tokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    wallet,             // payer
    mintPubkey,         // mint
    wallet.publicKey    // owner of the ATA
  );

  console.log(`✅ ATA ready`);
  console.log(`   ATA Address : ${tokenAccount.address.toBase58()}`);
  console.log(`   ATA Tx      : (created or already existed)\n`);

  // ── Step 2: Mint initial supply ────────────────────────────────────────────
  const rawAmount = BigInt(INITIAL_SUPPLY) * BigInt(10 ** TOKEN_DECIMALS);

  console.log(`🪙  Minting ${INITIAL_SUPPLY.toLocaleString()} BREAL (raw: ${rawAmount.toString()} base units)...`);

  const mintTxSig = await mintTo(
    connection,
    wallet,                    // payer & signing authority
    mintPubkey,                // mint
    tokenAccount.address,      // destination ATA
    wallet.publicKey,          // mint authority
    rawAmount                  // amount in base units
  );

  console.log(`\n✅ Mint successful!`);
  console.log(`\n─────────────────────────────────────────────────────────────────`);
  console.log(`📍 Mint Address       : ${mintPubkey.toBase58()}`);
  console.log(`🔑 ATA Address        : ${tokenAccount.address.toBase58()}`);
  console.log(`📝 Mint Tx Signature  : ${mintTxSig}`);
  console.log(`🔗 Explorer           : https://explorer.solana.com/tx/${mintTxSig}?cluster=devnet`);
  console.log(`─────────────────────────────────────────────────────────────────`);
  console.log(`\n🎉 ${INITIAL_SUPPLY.toLocaleString()} BREAL minted to your wallet!\n`);
}

main().catch((err) => {
  console.error("\n❌ Error:", err.message ?? err);
  process.exit(1);
});
