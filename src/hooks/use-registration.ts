import { useCallback, useState } from "react";

const STORAGE_KEY = "akt_registered_user";

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
 * - Tokens are NOT credited here: the trial + welcome bonus are granted once
 *   by the backend when the wallet is created (`wallet.claimTrial`), so this
 *   client-side flag can never mint tokens by clearing storage.
 * - Registered state persists across reloads and mobile pauses.
 */
export function useRegistration() {
  const [user, setUser] = useState<RegisteredUser | null>(readRegistration);

  const isRegistered = user !== null;

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
  }, []);

  return {
    user,
    isRegistered,
    register,
    clearRegistration,
  };
}
