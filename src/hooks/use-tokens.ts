import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useRef } from "react";
import { useAuth } from "./use-auth";

/**
 * Token wallet backed by the Convex `wallets` table.
 *
 * Balances are server-authoritative:
 *   - the 20-token trial + 25-token welcome bonus are granted exactly once
 *     per account, inside `claimTrial` (existing wallets are untouched)
 *   - spending goes through `wallet.spend` (never negative)
 *   - refills are administrator-only (`admin.adjustBalance`) — this hook
 *     intentionally exposes no way for a user to add tokens themselves.
 */
export function useTokens() {
  const { user } = useAuth();
  const authed = user != null;
  const wallet = useQuery(api.wallet.getWallet, authed ? {} : "skip");
  const claimTrial = useMutation(api.wallet.claimTrial);
  const spendTx = useMutation(api.wallet.spend);

  const claimedRef = useRef(false);
  useEffect(() => {
    if (authed && wallet === null && !claimedRef.current) {
      claimedRef.current = true;
      claimTrial().catch(() => {
        claimedRef.current = false;
      });
    }
  }, [authed, wallet, claimTrial]);

  const tokens = wallet?.balance ?? 0;
  const isLoading = wallet === undefined;

  /** Spend tokens on the backend. Returns false when the balance is too low. */
  const spend = useCallback(
    async (amount: number): Promise<boolean> => {
      const balance = wallet?.balance ?? 0;
      if (!Number.isFinite(amount) || amount <= 0 || balance < amount) {
        return false;
      }
      try {
        await spendTx({ amount: Math.floor(amount) });
        return true;
      } catch {
        return false;
      }
    },
    [wallet, spendTx],
  );

  return { tokens, isLoading, spend };
}
