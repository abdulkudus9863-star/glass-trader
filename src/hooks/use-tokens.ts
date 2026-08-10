import { useCallback, useEffect, useState } from "react";

const TOKENS_KEY = "akt-token-balance";
const TRIAL_BALANCE = 20;

/**
 * Trial token wallet. Persists to localStorage so the balance survives
 * reloads. Strategy compiles cost 5 tokens each.
 */
export function useTokens() {
  const [tokens, setTokens] = useState<number>(TRIAL_BALANCE);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(TOKENS_KEY);
      if (raw != null) {
        const n = Number(raw);
        if (Number.isFinite(n)) setTokens(Math.max(0, Math.floor(n)));
      }
    } catch {
      /* storage unavailable — keep trial balance */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(TOKENS_KEY, String(tokens));
    } catch {
      /* ignore quota errors */
    }
  }, [tokens]);

  const spend = useCallback(
    (amount: number): boolean => {
      if (tokens < amount) return false;
      setTokens((t) => t - amount);
      return true;
    },
    [tokens],
  );

  const topUp = useCallback((amount: number) => {
    setTokens((t) => t + amount);
  }, []);

  return { tokens, spend, topUp };
}
