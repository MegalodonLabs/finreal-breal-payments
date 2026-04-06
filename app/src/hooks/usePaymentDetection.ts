import { useEffect, useRef, useState } from 'react'
import { Connection, PublicKey } from '@solana/web3.js'
import { getAccount } from '@solana/spl-token'
import {
  RPC_URL,
  MERCHANT_ATA,
  TOKEN_DECIMALS,
  POLL_INTERVAL_MS,
  PAYMENT_TIMEOUT_SEC,
} from '../config'

export type DetectionStatus = 'idle' | 'polling' | 'confirmed' | 'timeout' | 'error'

interface Options {
  expectedAmount: number  // human-readable BREAL (e.g. 10.5)
  enabled: boolean
}

interface Result {
  status: DetectionStatus
  txSignature: string | null
}

export function usePaymentDetection({ expectedAmount, enabled }: Options): Result {
  const [status, setStatus]       = useState<DetectionStatus>('idle')
  const [txSignature, setTxSig]   = useState<string | null>(null)

  const baselineRef               = useRef<bigint | null>(null)
  const pollRef                   = useRef<ReturnType<typeof setInterval> | null>(null)
  const timeoutRef                = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!enabled) {
      setStatus('idle')
      setTxSig(null)
      baselineRef.current = null
      return
    }

    const connection  = new Connection(RPC_URL, 'confirmed')
    const ataKey      = new PublicKey(MERCHANT_ATA)
    const rawExpected = BigInt(Math.round(expectedAmount * 10 ** TOKEN_DECIMALS))
    let cancelled     = false

    const cleanup = () => {
      cancelled = true
      if (pollRef.current)    clearInterval(pollRef.current)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }

    const init = async () => {
      try {
        // Snapshot the balance before the payment request was shown
        const snapshot = await getAccount(connection, ataKey)
        if (cancelled) return
        baselineRef.current = snapshot.amount
        setStatus('polling')

        // Poll for balance increase
        pollRef.current = setInterval(async () => {
          try {
            const current = await getAccount(connection, ataKey)
            const baseline = baselineRef.current ?? 0n
            const received = current.amount > baseline
              ? current.amount - baseline
              : 0n

            if (received >= rawExpected) {
              const sigs = await connection.getSignaturesForAddress(ataKey, { limit: 1 })
              if (!cancelled) {
                setTxSig(sigs[0]?.signature ?? null)
                setStatus('confirmed')
              }
              cleanup()
            }
          } catch {
            // Transient RPC error — retry on next tick
          }
        }, POLL_INTERVAL_MS)

        // Timeout guard
        timeoutRef.current = setTimeout(() => {
          if (!cancelled) setStatus('timeout')
          cleanup()
        }, PAYMENT_TIMEOUT_SEC * 1_000)

      } catch (err) {
        console.error('[usePaymentDetection] init failed:', err)
        if (!cancelled) setStatus('error')
      }
    }

    init()
    return cleanup
  }, [enabled, expectedAmount])

  return { status, txSignature }
}
