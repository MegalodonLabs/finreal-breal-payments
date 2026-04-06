import { useState, useEffect } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { Transaction, PublicKey } from '@solana/web3.js'
import { encodeURL } from '@solana/pay'
import BigNumber from 'bignumber.js'
import {
  createTransferInstruction,
  getAssociatedTokenAddress,
  getAccount,
} from '@solana/spl-token'
import { usePaymentDetection } from './hooks/usePaymentDetection'
import {
  TOKEN_MINT,
  TOKEN_SYMBOL,
  TOKEN_DECIMALS,
  MERCHANT_ADDRESS,
  MERCHANT_ATA,
  PAYMENT_TIMEOUT_SEC,
} from './config'

// ── Types ──────────────────────────────────────────────────────────────────────

type Screen = 'idle' | 'awaiting' | 'success' | 'failed'

// ── Helpers ────────────────────────────────────────────────────────────────────

const shorten = (s: string, n = 6) => `${s.slice(0, n)}...${s.slice(-n)}`

const fmt = (n: number) =>
  n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: TOKEN_DECIMALS,
  })

function buildSolanaPayUrl(amount: number): string {
  const url = encodeURL({
    recipient:  new PublicKey(MERCHANT_ADDRESS),
    splToken:   new PublicKey(TOKEN_MINT),
    amount:     new BigNumber(amount),
    label:      'BReal ATM',
    message:    'Payment via BReal Terminal',
  })
  return url.toString()
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function App() {
  const [screen, setScreen]             = useState<Screen>('idle')
  const [inputAmount, setInputAmount]   = useState('')
  const [parsedAmount, setParsedAmount] = useState(0)
  const [error, setError]               = useState('')
  const [elapsed, setElapsed]           = useState(0)
  const [isSending, setIsSending]       = useState(false)
  const [finalTx, setFinalTx]           = useState<string | null>(null)

  const { connection }                              = useConnection()
  const { publicKey, connected, sendTransaction }   = useWallet()

  // ── On-chain detection ─────────────────────────────────────────────────────

  const { status: detectStatus, txSignature } = usePaymentDetection({
    expectedAmount: parsedAmount,
    enabled: screen === 'awaiting',
  })

  useEffect(() => {
    if (screen !== 'awaiting') return
    if (detectStatus === 'confirmed') {
      setFinalTx(txSignature)
      setScreen('success')
    } else if (detectStatus === 'timeout') {
      setScreen('failed')
    }
  }, [detectStatus, screen, txSignature])

  // ── Countdown ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (screen !== 'awaiting') { setElapsed(0); return }
    const t = setInterval(() => setElapsed(e => e + 1), 1_000)
    return () => clearInterval(t)
  }, [screen])

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleGenerate = () => {
    const val = parseFloat(inputAmount.replace(',', '.'))
    if (isNaN(val) || val <= 0) {
      setError('INVALID AMOUNT — ENTER A POSITIVE NUMBER')
      return
    }
    setParsedAmount(val)
    setError('')
    setScreen('awaiting')
  }

  const handlePayFromWallet = async () => {
    if (!publicKey) { setError('CONNECT YOUR WALLET FIRST'); return }
    setIsSending(true)
    setError('')
    try {
      const mintKey   = new PublicKey(TOKEN_MINT)
      const destKey   = new PublicKey(MERCHANT_ATA)
      const sourceAta = await getAssociatedTokenAddress(mintKey, publicKey)

      let sourceAcct
      try {
        sourceAcct = await getAccount(connection, sourceAta)
      } catch {
        setError(`NO ${TOKEN_SYMBOL} TOKEN ACCOUNT FOUND IN CONNECTED WALLET`)
        return
      }

      const rawAmt = BigInt(Math.round(parsedAmount * 10 ** TOKEN_DECIMALS))
      if (sourceAcct.amount < rawAmt) {
        const bal = Number(sourceAcct.amount) / 10 ** TOKEN_DECIMALS
        setError(`INSUFFICIENT BALANCE — WALLET HAS ${bal.toFixed(6)} ${TOKEN_SYMBOL}`)
        return
      }

      const tx = new Transaction().add(
        createTransferInstruction(sourceAta, destKey, publicKey, rawAmt)
      )
      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash()
      tx.recentBlockhash = blockhash
      tx.feePayer        = publicKey

      const sig = await sendTransaction(tx, connection)
      await connection.confirmTransaction(
        { signature: sig, blockhash, lastValidBlockHeight },
        'confirmed'
      )
      setFinalTx(sig)
      setScreen('success')
    } catch (err: any) {
      if (err?.name === 'WalletSignTransactionError') {
        setError('TRANSACTION CANCELLED')
      } else {
        setError((err?.message ?? 'TRANSACTION FAILED').toUpperCase().slice(0, 72))
      }
    } finally {
      setIsSending(false)
    }
  }

  const handleReset = () => {
    setScreen('idle')
    setInputAmount('')
    setParsedAmount(0)
    setError('')
    setFinalTx(null)
    setElapsed(0)
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const remaining     = Math.max(0, PAYMENT_TIMEOUT_SEC - elapsed)
  const progressPct   = Math.min(100, (elapsed / PAYMENT_TIMEOUT_SEC) * 100)
  const solanaPayUrl  = buildSolanaPayUrl(parsedAmount)
  const explorerUrl   = finalTx
    ? `https://explorer.solana.com/tx/${finalTx}?cluster=devnet`
    : null

  const statusLabel =
    detectStatus === 'idle'    ? 'INITIALIZING...' :
    detectStatus === 'polling' ? 'AWAITING PAYMENT' :
    detectStatus === 'error'   ? 'RPC ERROR — RETRYING' :
    'CHECKING...'

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="terminal">

      {/* ── Header ── */}
      <div className="t-header">
        &diams; B R E A L &nbsp; P A Y &nbsp; T E R M I N A L &diams;
      </div>

      {/* ── Meta bar ── */}
      <div className="t-meta">
        <div className="t-meta-cell">
          <div className="t-label">MERCHANT</div>
          <div className="t-value">{shorten(MERCHANT_ADDRESS)}</div>
        </div>
        <div className="t-meta-cell">
          <div className="t-label">NETWORK</div>
          <div className="t-value">SOLANA DEVNET</div>
        </div>
        <div className="t-meta-cell">
          <div className="t-label">TOKEN</div>
          <div className="t-value">{TOKEN_SYMBOL}</div>
        </div>
        <div className="t-meta-cell">
          <div className="t-label">STATE</div>
          <div
            className="t-value"
            style={{
              color:
                screen === 'success' ? '#4ade80' :
                screen === 'failed'  ? '#f87171' :
                '#f59e0b',
            }}
          >
            {screen.toUpperCase()}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          IDLE — amount entry
      ══════════════════════════════════════════════════════════════════════ */}
      {screen === 'idle' && (
        <div className="t-body">
          <div className="t-prompt">ENTER PAYMENT AMOUNT ({TOKEN_SYMBOL})</div>

          <div className="t-input-box">
            <span style={{ opacity: 0.5, fontSize: 18 }}>&gt;</span>
            <input
              type="number"
              value={inputAmount}
              onChange={e => { setInputAmount(e.target.value); setError('') }}
              onKeyDown={e => e.key === 'Enter' && handleGenerate()}
              placeholder="0.00"
              min="0"
              step="0.01"
              autoFocus
            />
            <span style={{ opacity: 0.35, fontSize: 13 }}>{TOKEN_SYMBOL}</span>
          </div>

          {error
            ? <div className="t-error">&#x2717; {error}</div>
            : <div className="t-error" />
          }

          <button className="t-btn" onClick={handleGenerate}>
            [ GENERATE PAYMENT REQUEST ]
          </button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          AWAITING — QR + wallet button + status
      ══════════════════════════════════════════════════════════════════════ */}
      {screen === 'awaiting' && (
        <>
          {/* Amount */}
          <div className="t-amount-bar">
            <div className="t-label">PAYMENT AMOUNT</div>
            <div className="t-amount-large">{fmt(parsedAmount)} {TOKEN_SYMBOL}</div>
          </div>

          {/* QR Code */}
          <div className="t-qr-section">
            <div className="t-label">SCAN WITH SOLANA PAY WALLET</div>
            <div className="t-qr-frame">
              <QRCodeSVG
                value={solanaPayUrl}
                size={200}
                level="M"
                includeMargin={false}
              />
            </div>
          </div>

          <hr className="t-divider" />

          {/* Browser wallet */}
          <div className="t-wallet-section">
            <div className="t-label" style={{ marginBottom: 10 }}>
              OR PAY WITH BROWSER WALLET
            </div>
            <WalletMultiButton />
            {connected && publicKey && (
              <>
                <div
                  className="t-label"
                  style={{ margin: '8px 0 4px', fontSize: 10 }}
                >
                  CONNECTED: {shorten(publicKey.toBase58())}
                </div>
                <button
                  className="t-btn"
                  style={{ marginTop: 6 }}
                  onClick={handlePayFromWallet}
                  disabled={isSending}
                >
                  {isSending
                    ? '[ SENDING... ]'
                    : `[ PAY ${fmt(parsedAmount)} ${TOKEN_SYMBOL} ]`
                  }
                </button>
              </>
            )}
            {error && <div className="t-error">&#x2717; {error}</div>}
          </div>

          {/* Status bar */}
          <div className="t-status-bar">
            <span>
              <span className="t-dot" />
              {statusLabel}
            </span>
            <span style={{ opacity: 0.7 }}>
              {String(Math.floor(remaining / 60)).padStart(2, '0')}
              :{String(remaining % 60).padStart(2, '0')}
            </span>
          </div>

          {/* Progress bar — drains left to right */}
          <div className="t-progress-track">
            <div
              className="t-progress-fill"
              style={{ width: `${100 - progressPct}%` }}
            />
          </div>

          {/* Cancel */}
          <div style={{ padding: '12px 20px' }}>
            <button className="t-btn t-btn-ghost" onClick={handleReset}>
              [ CANCEL ]
            </button>
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          SUCCESS
      ══════════════════════════════════════════════════════════════════════ */}
      {screen === 'success' && (
        <div className="t-result">
          <div className="t-result-icon t-success">&#x2713;</div>
          <div className="t-result-title t-success">PAYMENT CONFIRMED</div>
          <div className="t-result-amount">{fmt(parsedAmount)} {TOKEN_SYMBOL}</div>

          {finalTx && (
            <div className="t-result-tx">
              <div className="t-label">TRANSACTION</div>
              <div className="t-value" style={{ fontSize: 11, wordBreak: 'break-all' }}>
                {finalTx}
              </div>
            </div>
          )}

          {explorerUrl && (
            <button
              className="t-btn"
              style={{ marginBottom: 8 }}
              onClick={() => window.open(explorerUrl, '_blank')}
            >
              [ VIEW ON EXPLORER ]
            </button>
          )}
          <button className="t-btn t-btn-ghost" onClick={handleReset}>
            [ NEW PAYMENT ]
          </button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          FAILED
      ══════════════════════════════════════════════════════════════════════ */}
      {screen === 'failed' && (
        <div className="t-result">
          <div className="t-result-icon t-fail">&#x2717;</div>
          <div className="t-result-title t-fail">PAYMENT TIMEOUT</div>
          <div
            style={{ opacity: 0.6, marginBottom: 28, fontSize: 12, letterSpacing: 1 }}
          >
            NO PAYMENT RECEIVED WITHIN {PAYMENT_TIMEOUT_SEC}S
          </div>
          <button className="t-btn" onClick={handleReset}>
            [ TRY AGAIN ]
          </button>
        </div>
      )}

      {/* ── Footer ── */}
      <div className="t-footer">
        SOLANA DEVNET &nbsp;·&nbsp; MINT {shorten(TOKEN_MINT, 8)}
      </div>

    </div>
  )
}
