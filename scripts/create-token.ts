import {
  Connection,
  Keypair,
  clusterApiUrl,
} from "@solana/web3.js";
import {
  createMint,
} from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";

// ─── Config ───────────────────────────────────────────────────────────────────

const TOKEN_NAME     = "BReal";
const TOKEN_SYMBOL   = "BREAL";
const TOKEN_DECIMALS = 6;
const NETWORK        = "devnet";

// Private Triton One RPC — more reliable than the public devnet endpoint.
// Falls back to the public endpoint if the env var is not set.
const RPC_URL =
  process.env.SOLANA_RPC_URL ?? "https://nyc252.nodes.rpcpool.com";

// ─── Wallet ───────────────────────────────────────────────────────────────────

/**
 * Loads the local Solana wallet from ~/.config/solana/id.json
 * Run `solana-keygen new` if this file doesn't exist yet.
 */
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

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🚀 Deploying ${TOKEN_NAME} (${TOKEN_SYMBOL}) on Solana ${NETWORK}...\n`);

  // Connect to Devnet via Triton One private RPC
  const connection = new Connection(RPC_URL, "confirmed");
  console.log(`🌐 RPC endpoint      : ${RPC_URL}`);

  // Load wallet — this becomes mint authority & freeze authority
  const wallet = loadWallet();
  console.log(`👛 Deployer wallet : ${wallet.publicKey.toBase58()}`);

  // Confirm the wallet has SOL for fees
  const balance = await connection.getBalance(wallet.publicKey);
  console.log(`💰 Wallet balance  : ${balance / 1e9} SOL`);
  if (balance === 0) {
    throw new Error(
      "Wallet has 0 SOL. Fund it first:\n  solana airdrop 2 --url devnet"
    );
  }

  console.log(`\n📦 Creating mint...`);
  console.log(`   Name     : ${TOKEN_NAME}`);
  console.log(`   Symbol   : ${TOKEN_SYMBOL}`);
  console.log(`   Decimals : ${TOKEN_DECIMALS}`);
  console.log(`   Mint auth: ${wallet.publicKey.toBase58()}`);
  console.log(`   Freeze   : ${wallet.publicKey.toBase58()}\n`);

  // Create the SPL token mint
  const mint = await createMint(
    connection,           // connection
    wallet,              // payer (signs the tx)
    wallet.publicKey,    // mint authority
    wallet.publicKey,    // freeze authority
    TOKEN_DECIMALS       // decimals
  );

  console.log(`✅ Token mint created!`);
  console.log(`\n─────────────────────────────────────────`);
  console.log(`🏷  Token Name   : ${TOKEN_NAME}`);
  console.log(`🔤 Token Symbol  : ${TOKEN_SYMBOL}`);
  console.log(`🔢 Decimals      : ${TOKEN_DECIMALS}`);
  console.log(`📍 Mint Address  : ${mint.toBase58()}`);
  console.log(`─────────────────────────────────────────\n`);

  // Persist mint address so mint-token.ts can read it
  const mintInfo = { mint: mint.toBase58() };
  const outPath = path.join(__dirname, "..", "mint-address.json");
  fs.writeFileSync(outPath, JSON.stringify(mintInfo, null, 2));
  console.log(`💾 Mint address saved to mint-address.json`);
  console.log(`\n👉 Next step: run  npm run mint-token\n`);
}

main().catch((err) => {
  console.error("\n❌ Error:", err.message ?? err);
  process.exit(1);
});
