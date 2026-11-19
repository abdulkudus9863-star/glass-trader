/**
 * Lightweight localStorage persistence for auth state.
 *
 * Convex Auth already persists the *token* internally (IndexedDB), but
 * `useConvexAuth().isLoading` is `true` while it revalidates on page load.
 * During that window `RequireAuth` shows a spinner and, if it resolves to
 * `false` before the token check completes, redirects to /auth.
 *
 * This module lets us cache the last-known user profile + auth flag so the
 * UI can render immediately from localStorage while the real check runs.
 */

export interface CachedAuthUser {
  /** Convex _id of the users row */
  _id: string;
  /** Display name */
  name?: string;
  /** Email address */
  email?: string;
  /** Whether user has founder status */
  isFounder?: boolean;
  /** User role (e.g. 'admin') */
  role?: string;
  /** Avatar image URL (https) chosen by the user */
  image?: string;
  /** Convex document creation time — used for "joined on" labels */
  _creationTime?: number;
}

const AUTH_CACHE_KEY = "auth_user";
const AUTH_SESSION_KEY = "auth_session_active";
const CACHE_VERSION_KEY = "auth_cache_version";
const CURRENT_VERSION = 2;

/** Safe read – returns null on any error / private-browsing / missing key. */
export function getCachedUser(): CachedAuthUser | null {
  try {
    const raw = localStorage.getItem(AUTH_CACHE_KEY);
    if (!raw) return null;
    const version = localStorage.getItem(CACHE_VERSION_KEY);
    if (version !== String(CURRENT_VERSION)) {
      localStorage.removeItem(AUTH_CACHE_KEY);
      localStorage.removeItem(AUTH_SESSION_KEY);
      return null;
    }
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed._id === "string") return parsed;
    return null;
  } catch {
    return null;
  }
}

/** Returns true if we previously had a valid session (even if Convex hasn't
 *  revalidated yet). */
export function hasCachedSession(): boolean {
  try {
    return localStorage.getItem(AUTH_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

/** Write the user profile + mark session as active. */
export function cacheAuthUser(user: CachedAuthUser | null): void {
  try {
    localStorage.setItem(CACHE_VERSION_KEY, String(CURRENT_VERSION));
    if (user) {
      localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(user));
      localStorage.setItem(AUTH_SESSION_KEY, "1");
    } else {
      localStorage.removeItem(AUTH_CACHE_KEY);
      localStorage.removeItem(AUTH_SESSION_KEY);
    }
  } catch {
    // silently ignore (quota, SSR, private browsing)
  }
}

/** Full clear – only called on explicit sign-out. */
export function clearAuthCache(): void {
  try {
    localStorage.removeItem(AUTH_CACHE_KEY);
    localStorage.removeItem(AUTH_SESSION_KEY);
    localStorage.removeItem(CACHE_VERSION_KEY);
  } catch {
    // ignore
  }
}
