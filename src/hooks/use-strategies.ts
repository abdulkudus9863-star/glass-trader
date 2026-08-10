import { useCallback, useEffect, useState } from "react";
import type { StrategySpec, StrategyStatus } from "@/lib/strategy";

const STRATEGIES_KEY = "akt-saved-strategies";

/** My Strategies portfolio — persists compiled specs to localStorage. */
export function useStrategies() {
  const [saved, setSaved] = useState<StrategySpec[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STRATEGIES_KEY);
      if (raw) setSaved(JSON.parse(raw) as StrategySpec[]);
    } catch {
      /* ignore corrupt storage */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STRATEGIES_KEY, JSON.stringify(saved));
    } catch {
      /* ignore quota errors */
    }
  }, [saved]);

  const save = useCallback((spec: StrategySpec) => {
    setSaved((prev) => {
      if (prev.some((s) => s.id === spec.id)) {
        return prev.map((s) => (s.id === spec.id ? { ...s, ...spec } : s));
      }
      return [spec, ...prev].slice(0, 50);
    });
  }, []);

  const remove = useCallback((id: string) => {
    setSaved((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const setStatus = useCallback((id: string, status: StrategyStatus) => {
    setSaved((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status } : s)),
    );
  }, []);

  return { saved, save, remove, setStatus };
}
