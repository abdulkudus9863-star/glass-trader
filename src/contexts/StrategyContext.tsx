import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

export interface AISignals {
  title: string;
  signalType: 'BUY' | 'SELL' | 'SHORT' | 'LONG' | 'WAIT';
  entryMin: number;
  entryMax: number;
  stopLoss: number;
  tp1?: number;
  tp2?: number;
  tp3?: number;
}

const STORAGE_KEY = 'active_ai_strategy';

/** Safe read from localStorage — returns null on any error or missing key. */
function readPersistedStrategy(): AISignals | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AISignals;
    // Validate minimal shape before restoring
    if (
      parsed &&
      typeof parsed.title === 'string' &&
      typeof parsed.signalType === 'string' &&
      typeof parsed.entryMin === 'number' &&
      typeof parsed.entryMax === 'number' &&
      typeof parsed.stopLoss === 'number'
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/** Safe write to localStorage — swallows errors (e.g. quota, SSR, private browsing). */
function persistStrategy(strategy: AISignals | null) {
  try {
    if (strategy) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(strategy));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // silently ignore — strategy still lives in React state
  }
}

interface StrategyContextType {
  activeStrategy: AISignals | null;
  showLines: boolean;
  setStrategy: (strategy: AISignals) => void;
  clearStrategy: () => void;
  toggleLines: () => void;
}

const StrategyContext = createContext<StrategyContextType | undefined>(undefined);

export const StrategyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Initialize from localStorage so a refreshed/reloaded page (or mobile
  // background/foreground cycle) immediately shows the last active strategy.
  const [activeStrategy, setActiveStrategy] = useState<AISignals | null>(readPersistedStrategy);
  const [showLines, setShowLines] = useState<boolean>(true);

  // Sync every state change to localStorage
  useEffect(() => {
    persistStrategy(activeStrategy);
  }, [activeStrategy]);

  const setStrategy = useCallback((strategy: AISignals) => {
    setActiveStrategy(strategy);
    setShowLines(true);
  }, []);

  const clearStrategy = useCallback(() => setActiveStrategy(null), []);

  const toggleLines = useCallback(() => setShowLines((prev) => !prev), []);

  return (
    <StrategyContext.Provider value={{ activeStrategy, showLines, setStrategy, clearStrategy, toggleLines }}>
      {children}
    </StrategyContext.Provider>
  );
};

export const useStrategy = () => {
  const context = useContext(StrategyContext);
  if (!context) throw new Error('useStrategy must be used within StrategyProvider');
  return context;
};
