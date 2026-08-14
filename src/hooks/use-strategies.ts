import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useRef } from "react";
import type { StrategySpec, StrategyStatus } from "@/lib/strategy";
import { useAuth } from "./use-auth";

const STRATEGIES_KEY = "akt-saved-strategies";

/**
 * My Strategies portfolio backed by the Convex `strategies` table.
 *
 * Compiled specs persist per user on the backend (survive reloads, follow
 * the user across devices). A one-time migration imports any portfolio left
 * in localStorage by the previous client-only build.
 */
export function useStrategies() {
  const { user } = useAuth();
  const authed = user != null;
  const docs = useQuery(api.strategies.list, authed ? {} : "skip");
  const saveTx = useMutation(api.strategies.save);
  const removeTx = useMutation(api.strategies.remove);
  const setStatusTx = useMutation(api.strategies.setStatus);

  const saved: StrategySpec[] = (docs ?? []).map(
    (d) => ({ ...d.spec }) as StrategySpec,
  );

  const migratedRef = useRef(false);
  useEffect(() => {
    if (!authed || docs === undefined || migratedRef.current) return;
    migratedRef.current = true;
    try {
      const raw = localStorage.getItem(STRATEGIES_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as StrategySpec[];
        for (const s of parsed) void saveTx({ spec: s });
        localStorage.removeItem(STRATEGIES_KEY);
      }
    } catch {
      /* ignore corrupt storage */
    }
  }, [authed, docs, saveTx]);

  const save = useCallback(
    (spec: StrategySpec) => {
      void saveTx({ spec });
    },
    [saveTx],
  );

  const remove = useCallback(
    (id: string) => {
      void removeTx({ specId: id });
    },
    [removeTx],
  );

  const setStatus = useCallback(
    (id: string, status: StrategyStatus) => {
      void setStatusTx({ specId: id, status });
    },
    [setStatusTx],
  );

  return { saved, save, remove, setStatus };
}
