import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "akt_registered_user";
const WELCOME_BONUS = 25;

export interface RegisteredUser {
  name: string;
  email: string;
  accessKey: string;
  registeredAt: number;
}

function readRegistration(): RegisteredUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof parsed.name === "string" &&
      typeof parsed.email === "string" &&
      typeof parsed.registeredAt === "number"
    ) {
      return parsed as RegisteredUser;
    }
  } catch {
    /* corrupted — clear */
    localStorage.removeItem(STORAGE_KEY);
  }
  return null;
}

/**
 * Manages engine-access registration backed by localStorage.
 *
 * - Unregistered users see a "Register to Unlock AI Engine" gate.
 * - On first registration, 25 welcome tokens are credited via the
 *   `onWelcomeBonus` callback (the caller wires this to `topUp`).
 * - Registered state persists across reloads and mobile pauses.
 */
export function useRegistration(onWelcomeBonus?: (amount: number) => void) {
  const [user, setUser] = useState<RegisteredUser | null>(readRegistration);
  const hasClaimedBonus = useRef(false);

  const isRegistered = user !== null;

  // One-time welcome bonus on first registration
  useEffect(() => {
    if (user && onWelcomeBonus && !hasClaimedBonus.current) {
      hasClaimedBonus.current = true;
      onWelcomeBonus(WELCOME_BONUS);
    }
  }, [user, onWelcomeBonus]);

  const register = useCallback(
    (name: string, email: string, accessKey: string) => {
      const profile: RegisteredUser = {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        accessKey: accessKey.trim(),
        registeredAt: Date.now(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
      setUser(profile);
    },
    [],
  );

  const clearRegistration = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
    hasClaimedBonus.current = false;
  }, []);

  return {
    user,
    isRegistered,
    register,
    clearRegistration,
  };
}
