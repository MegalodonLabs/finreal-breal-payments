import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount, transfer } from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";

// ── Configuration ──────────────────────────────────────────────────────────────
// Replace RECIPIENT with the public key of the wallet you want to fund.
// The sender is always the local deployer wallet (~/.config/solana/id.json).

const MINT           = "9yC8LkyqpCFtXyBpEGBfrRtYu4nVc4VS3JGQQJmgJXr8";
const TOKEN_DECIMALS = 6;
const AMOUNT         = 1_000;   // BREAL to transfer
const RECIPIENT      = "<PASTE_RECIPIENT_WALLET_ADDRESS_HERE>";
const RPC_URL        = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";

function loadWallet(): Keypair {
  const keyPath = path.join(
    process.env.HOME || process.env.USERPROFILE || "~",
    ".config", "solana", "id.json"
  );
  const secretKey = Uint8Array.from(JSON.parse(fs.readFileSync(keyPath, "utf-8")));
  return Keypair.fromSecretKey(secretKey);
}

async function main() {
  console.log(`\n💸 Sending ${AMOUNT} BREAL to ${RECIPIENT}...\n`);

  const connection  = new Connection(RPC_URL, "confirmed");
  const wallet      = loadWallet();
  const mintPubkey  = new PublicKey(MINT);
  const recipient   = new PublicKey(RECIPIENT);

  console.log(`👛 Sender  : ${wallet.publicKey.toBase58()}`);
  console.log(`📬 Receiver: ${recipient.toBase58()}\n`);

  // Get sender ATA
  const senderAta = await getOrCreateAssociatedTokenAccount(
    connection, wallet, mintPubkey, wallet.publicKey
  );

  // Get or create receiver ATA
  console.log("🔑 Getting or creating receiver ATA...");
  const receiverAta = await getOrCreateAssociatedTokenAccount(
    connection, wallet, mintPubkey, recipient
  );
  console.log(`   ATA: ${receiverAta.address.toBase58()}\n`);

  // Transfer
  const rawAmount = BigInt(AMOUNT) * BigInt(10 ** TOKEN_DECIMALS);
  const sig = await transfer(
    connection,
    wallet,
    senderAta.address,
    receiverAta.address,
    wallet.publicKey,
    rawAmount
  );

  console.log(`✅ Transfer successful!`);
  console.log(`📝 Tx : ${sig}`);
  console.log(`🔗 Explorer: https://explorer.solana.com/tx/${sig}?cluster=devnet\n`);
}

main().catch((err) => {
  console.error("\n❌ Error:", err.message ?? err);
  process.exit(1);
});
