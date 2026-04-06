// ── Token ──────────────────────────────────────────────────────────────────────
export const TOKEN_MINT     = '9yC8LkyqpCFtXyBpEGBfrRtYu4nVc4VS3JGQQJmgJXr8'
export const TOKEN_SYMBOL   = 'BREAL'
export const TOKEN_DECIMALS = 6

// ── Merchant ───────────────────────────────────────────────────────────────────
// The deployer wallet acts as the payment receiver (kiosk merchant).
export const MERCHANT_ADDRESS = '6QBdpsrEUSUaxSDYLVnnCuRoZPP9dM44y27HEXzR79ye'
export const MERCHANT_ATA     = '3uzKCkxtcTmorMAhzCcoVdLB6fAD3Y7k28cYhr32j9c6'

// ── Network ────────────────────────────────────────────────────────────────────
// Override with VITE_RPC_URL in a .env file to use a private RPC.
export const RPC_URL = (import.meta.env.VITE_RPC_URL as string | undefined)
                     ?? 'https://api.devnet.solana.com'

// ── Payment session ────────────────────────────────────────────────────────────
export const POLL_INTERVAL_MS    = 3_000   // check RPC every 3 seconds
export const PAYMENT_TIMEOUT_SEC = 120     // expire after 2 minutes
