import React, { createContext, useContext, useState } from 'react';

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

interface StrategyContextType {
  activeStrategy: AISignals | null;
  showLines: boolean;
  setStrategy: (strategy: AISignals) => void;
  clearStrategy: () => void;
  toggleLines: () => void;
}

const StrategyContext = createContext<StrategyContextType | undefined>(undefined);

export const StrategyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeStrategy, setActiveStrategy] = useState<AISignals | null>(null);
  const [showLines, setShowLines] = useState<boolean>(true);

  const setStrategy = (strategy: AISignals) => {
    setActiveStrategy(strategy);
    setShowLines(true);
  };

  const clearStrategy = () => setActiveStrategy(null);
  const toggleLines = () => setShowLines((prev) => !prev);

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
