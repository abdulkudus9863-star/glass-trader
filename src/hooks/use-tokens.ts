import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useRef } from "react";
import { useAuth } from "./use-auth";

const TOKENS_KEY = "akt-token-balance";

/**
 * Token wallet backed by the Convex `wallets` table.
 *
 * The 20-token trial balance is granted once per account via `claimTrial`,
 * then the balance lives on the backend so it survives reloads and follows
 * the user across devices. Any balance left in localStorage by the previous
 * (client-only) build is migrated into the wallet once.
 */
export function useTokens() {
  const { user } = useAuth();
  const authed = user != null;
  const wallet = useQuery(api.wallet.getWallet, authed ? {} : "skip");
  const claimTrial = useMutation(api.wallet.claimTrial);
  const spendTx = useMutation(api.wallet.spend);
  const topUpTx = useMutation(api.wallet.topUp);

  const claimedRef = useRef(false);
  useEffect(() => {
    if (authed && wallet === null && !claimedRef.current) {
      claimedRef.current = true;
      claimTrial().catch(() => {
        claimedRef.current = false;
      });
    }
  }, [authed, wallet, claimTrial]);

  /* migrate a leftover localStorage balance from the pre-Convex build once */
  useEffect(() => {
    if (!authed || wallet == null) return;
    try {
      const raw = localStorage.getItem(TOKENS_KEY);
      if (raw != null) {
        const n = Math.floor(Number(raw));
        if (Number.isFinite(n) && n > wallet.balance) {
          void topUpTx({ amount: n - wallet.balance });
        }
        localStorage.removeItem(TOKENS_KEY);
      }
    } catch {
      /* storage unavailable — ignore */
    }
  }, [authed, wallet, topUpTx]);

  const tokens = wallet?.balance ?? 0;

  /** Spend tokens on the backend. Returns false when the balance is too low. */
  const spend = useCallback(
    async (amount: number): Promise<boolean> => {
      const balance = wallet?.balance ?? 0;
      if (balance < amount) return false;
      try {
        await spendTx({ amount });
        return true;
      } catch {
        return false;
      }
    },
    [wallet, spendTx],
  );

  /** Credit tokens to the wallet (Token Store). */
  const topUp = useCallback(
    async (amount: number): Promise<void> => {
      try {
        await topUpTx({ amount });
      } catch {
        /* ignore */
      }
    },
    [topUpTx],
  );

  return { tokens, spend, topUp };
}
