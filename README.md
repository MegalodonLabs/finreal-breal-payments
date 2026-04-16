# BReal Token (BREAL)

Reference implementation for deploying the BReal (BREAL) SPL token on Solana Devnet and running a local terminal-style payment simulation.

## Overview

This repository includes two main components:

Token deployment (`/scripts`): TypeScript scripts that create the BReal SPL token mint, configure authorities, create the deployer's Associated Token Account, and mint the initial supply.

Payment terminal (`/app`): A browser-based terminal UI that simulates an ATM or kiosk payment environment. It accepts BREAL payments from connected wallets, generates Solana Pay QR codes, and detects on-chain transactions via RPC polling.

This project demonstrates a complete end-to-end stablecoin payment flow on Solana, including token issuance, wallet-based payments, and real-time settlement detection.


## Token Configuration

| Field | Value |
|---|---|
| Name | BReal |
| Symbol | BREAL |
| Decimals | 6 |
| Initial Supply | 1,000,000 BREAL |
| Mint Address | `9yC8LkyqpCFtXyBpEGBfrRtYu4nVc4VS3JGQQJmgJXr8` |
| Mint Authority | Deployer wallet |
| Freeze Authority | Deployer wallet |
| Network | Solana Devnet |


## Prerequisites

| Requirement | Version |
|---|---|
| Node.js | 18+ |
| npm | 9+ |
| Solana CLI | 3.x+ |

**Install the Solana CLI on Windows:**

```powershell
& "$env:USERPROFILE\Downloads\agave-install-init-x86_64-pc-windows-msvc.exe" stable
```

Download the installer from: https://github.com/anza-xyz/agave/releases/latest

**Install the Solana CLI on macOS / Linux:**

```bash
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
```


## Part 1: Token Deployment

### Setup

1. Install dependencies

```bash
npm install
```

2. Create a local wallet

```bash
solana-keygen new --outfile ~/.config/solana/id.json
```

Store the seed phrase in a safe location. This wallet is used as the mint authority, freeze authority, and transaction payer.

3. Configure the network

```bash
solana config set --url https://api.devnet.solana.com
```

4. Fund the wallet

```bash
solana airdrop 2
solana balance
```

If the CLI airdrop is rate-limited, use the web faucet at https://faucet.solana.com. A minimum of 0.05 SOL is required to cover transaction fees.

### Run

Run the following commands in sequence.

1. Deploy the token mint

```bash
npm run create-token
```

Creates the BReal token mint with the configured decimals and authorities. Saves the mint address to `mint-address.json`.

2. Create the ATA and mint initial supply

```bash
npm run mint-token
```

Creates the Associated Token Account (ATA) for the deployer wallet and mints 1,000,000 BREAL to it.

### Expected Output

**create-token**

```
Deploying BReal (BREAL) on Solana devnet...

RPC endpoint     : https://api.devnet.solana.com
Deployer wallet  : <WALLET_ADDRESS>
Token mint created.
Mint Address     : <MINT_ADDRESS>
Mint address saved to mint-address.json
```

**mint-token**

```
Minting 1,000,000 BREAL on Solana devnet...

ATA Address      : <ATA_ADDRESS>
Mint Tx          : <TX_SIGNATURE>
Explorer         : https://explorer.solana.com/tx/<TX_SIGNATURE>?cluster=devnet
```


## Part 2: Payment Terminal

A terminal-style interface that simulates an ATM or kiosk. The deployer wallet acts as the merchant. A separate wallet is used as the payer.

### Fund a Test Wallet

Before testing payments, the payer wallet must hold BREAL.

Open `scripts/fund-test-wallet.ts` and replace the `RECIPIENT` value with the public key of your test wallet:

```ts
const RECIPIENT = "<PASTE_RECIPIENT_WALLET_ADDRESS_HERE>";
```

Then run:

```bash
$env:SOLANA_RPC_URL="https://api.devnet.solana.com"   # PowerShell
npx ts-node scripts/fund-test-wallet.ts
```

This transfers 1,000 BREAL from the deployer wallet to the recipient. The script automatically creates the recipient's ATA if it does not exist.

The recipient wallet also needs a small SOL balance to cover transaction fees. Use the faucet at https://faucet.solana.com if needed.

### Run the Terminal

```bash
cd app
npm install --legacy-peer-deps
npm run dev
```

The terminal is available at `http://localhost:5173`.

To access it from another device on the same network (e.g. a mobile browser):

```bash
npm run dev -- --host
```

Then open the `Network` URL shown in the terminal output on the other device.

### Recommended Demo Flow

**Before starting, ensure the following:**
- The payer wallet must hold BREAL on devnet. Use `fund-test-wallet.ts` to transfer tokens from the deployer wallet (see [Fund a Test Wallet](#fund-a-test-wallet)).
- The payer wallet must also hold a small SOL balance to cover transaction fees. Use https://faucet.solana.com if needed.

**Steps:**

1. Open the terminal at `http://localhost:5173`
2. Enter a payment amount in BREAL and click **Generate Payment Request**
3. Click **Connect Wallet** and select a supported wallet (Phantom or Solflare)
4. Click **Pay** and confirm the transaction in the wallet popup
5. The terminal polls the RPC automatically. No manual action is required.
6. When the on-chain balance change is detected, the terminal transitions to the success screen, displaying the transaction signature and a **View on Explorer** link
7. Click **View on Explorer** to verify the transaction on Solana Explorer (select Devnet in the cluster selector if needed)

### Payment Detection

The terminal does not use a backend or websockets. When a payment request is created, it snapshots the merchant ATA balance and polls the RPC every 3 seconds. When the balance increases by at least the requested amount, the session transitions to success. If no payment is received within 2 minutes, the session times out.

### QR Code

Each payment request generates a QR code encoded using the Solana Pay Transfer Request specification via the `@solana/pay` library:

```
solana:<recipient>?amount=<amount>&spl-token=<mint>&label=BReal%20ATM&message=...
```

This format is compatible with major Solana wallets on mainnet. On devnet, mobile wallet QR scanners may not fully support SPL token Solana Pay flows. Some apps treat the full URI as a plain text address instead of parsing it as a payment request. The browser wallet flow is the recommended path for local devnet testing.


## Transaction Flow

1. The operator enters a BREAL amount and submits the payment request
2. The app snapshots the merchant ATA balance and generates a Solana Pay QR code
3. The payer connects their wallet using the Connect Wallet button
4. The payer clicks Pay and confirms the transaction in their wallet
5. The SPL token program transfers the specified BREAL amount to the merchant ATA
6. The app detects the balance increase via RPC polling (`getTokenAccountBalance` every 3 seconds)
7. The UI transitions to the success state and displays the transaction signature with a link to the Solana Explorer


## Architecture

### Token Setup

The deployment creates the token mint and the deployer's Associated Token Account (ATA). The mint account (`9yC8...Xr8`) defines the token: symbol, decimals, mint authority, and freeze authority. The ATA (`3uzK...c6`) is derived deterministically from the mint and the deployer's public key, and holds the token balance for that wallet.

### Frontend Terminal Flow

The app is implemented as a simple state machine with four states: idle, awaiting, success, and timeout. On idle, the user enters an amount. On submit, the app snapshots the current merchant ATA balance and transitions to awaiting, displaying the payment UI.

### Payment Execution

Two payment paths are supported. With a connected browser wallet (Phantom or Solflare), the app constructs a transfer instruction using `@solana/spl-token` and submits it directly via the wallet adapter. For mobile, a Solana Pay Transfer Request URL is encoded with `@solana/pay` and rendered as a QR code.

### On-Chain Detection

No backend is used. `usePaymentDetection.ts` polls `getTokenAccountBalance` on the merchant ATA every 3 seconds. When the balance increases by at least the requested amount, the session transitions to `success`. If the threshold is not met within 120 seconds, the session times out.

### Accounts Involved

| Role | Account |
|---|---|
| Merchant ATA | `3uzKCkxtcTmorMAhzCcoVdLB6fAD3Y7k28cYhr32j9c6` |
| Payer wallet | Any wallet holding BREAL on devnet |
| Token mint | `9yC8LkyqpCFtXyBpEGBfrRtYu4nVc4VS3JGQQJmgJXr8` |


## Verification

Confirm the deployment on Solana Explorer:

**Transaction**
```
https://explorer.solana.com/tx/<TX_SIGNATURE>?cluster=devnet
```

**Token mint**
```
https://explorer.solana.com/address/<MINT_ADDRESS>?cluster=devnet
```

**Token account**
```
https://explorer.solana.com/address/<ATA_ADDRESS>?cluster=devnet
```

These links confirm the deployed token mint, token account, and transaction.


## Deployment Reference

| Field | Value |
|---|---|
| Mint Address | `9yC8LkyqpCFtXyBpEGBfrRtYu4nVc4VS3JGQQJmgJXr8` |
| ATA Address | `3uzKCkxtcTmorMAhzCcoVdLB6fAD3Y7k28cYhr32j9c6` |
| Mint Transaction | `3zpWkF8Z5aXTPQFGxRyn3PoUFoxvnq1zES7Kaa5KCH4YE7L3Rz13PeacxSaYApPQZaZv6YDovSqXoMcgrSxk82c9` |
| Explorer | [View on Solana Explorer](https://explorer.solana.com/tx/3zpWkF8Z5aXTPQFGxRyn3PoUFoxvnq1zES7Kaa5KCH4YE7L3Rz13PeacxSaYApPQZaZv6YDovSqXoMcgrSxk82c9?cluster=devnet) |


## Project Structure

```
finreal-breal-payments/
├── scripts/
│   ├── create-token.ts
│   ├── mint-token.ts
│   └── fund-test-wallet.ts
├── app/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   ├── config.ts
│   │   ├── terminal.css
│   │   └── hooks/
│   │       └── usePaymentDetection.ts
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   └── tsconfig.json
├── mint-address.json
├── package.json
├── tsconfig.json
└── README.md
```

- `scripts/create-token.ts`: deploys the BReal token mint and sets authorities.
- `scripts/mint-token.ts`: creates the deployer ATA and mints 1,000,000 BREAL.
- `scripts/fund-test-wallet.ts`: transfers BREAL from the deployer wallet to a test wallet for payment testing.
- `app/src/App.tsx`: full terminal UI with payment state machine.
- `app/src/hooks/usePaymentDetection.ts`: RPC polling logic for on-chain payment detection.
- `app/src/config.ts`: token, merchant, and network constants.
- `mint-address.json`: auto-generated by `create-token.ts`. Required by `mint-token.ts`.


## Dependencies

### Token scripts

| Package | Version | Purpose |
|---|---|---|
| `@solana/web3.js` | ^1.98.0 | Solana RPC client and transaction building |
| `@solana/spl-token` | ^0.4.9 | SPL token program instructions |
| `ts-node` | ^10.9.2 | Run TypeScript scripts without a build step |
| `typescript` | ^5.7.0 | TypeScript compiler |

### Payment terminal

| Package | Version | Purpose |
|---|---|---|
| `@solana/web3.js` | ^1.98.0 | Solana RPC client |
| `@solana/spl-token` | ^0.4.9 | Token transfer instructions |
| `@solana/pay` | ^0.2.5 | Solana Pay URL encoding |
| `@solana/wallet-adapter-react` | ^0.15.35 | Wallet connection hooks |
| `@solana/wallet-adapter-react-ui` | ^0.9.35 | Wallet connect button |
| `@solana/wallet-adapter-phantom` | ^0.9.24 | Phantom wallet adapter |
| `@solana/wallet-adapter-solflare` | ^0.6.28 | Solflare wallet adapter |
| `qrcode.react` | ^4.1.0 | QR code rendering |
| `bignumber.js` | ^9.1.2 | Precise decimal amounts for Solana Pay |
| `react` / `react-dom` | ^18.3.1 | UI framework |
| `vite` | ^5.4.0 | Development server and build tool |
