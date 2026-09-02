import { api } from "@/convex/_generated/api";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useQuery } from "convex/react";
import { useCallback, useEffect, useRef } from "react";
import {
  cacheAuthUser,
  clearAuthCache,
  getCachedUser,
  hasCachedSession,
  type CachedAuthUser,
} from "@/lib/auth-persist";

/**
 * Auth hook with localStorage rehydration.
 *
 * Convex Auth persists its own tokens in IndexedDB, but there is a brief
 * window on page load (or mobile foreground resume) where `useConvexAuth`
 * is still loading. During that window RequireAuth would redirect to /auth
 * if we treated `isLoading` as blocking.
 *
 * This hook caches the Convex `users.sessionUser` query result in localStorage
 * so that:
 *  1. `isLoading` is `false` immediately if a cached session exists, preventing
     the redirect loop.
 *  2. The cached user profile renders instantly (name, avatar, role).
 *  3. Once Convex resolves the real query, the cache is updated.
 *  4. On explicit sign-out, the cache is cleared.
 */
export function useAuth() {
  const { isLoading: isAuthLoading, isAuthenticated } = useConvexAuth();
  const user = useQuery(api.users.sessionUser);
  const { signIn, signOut: convexSignOut } = useAuthActions();

  // --- localStorage cache ---
  const cachedUser = useRef<CachedAuthUser | null>(getCachedUser());
  const hasCached = useRef(hasCachedSession());

  // Update cache whenever Convex returns a real user
  useEffect(() => {
    if (user !== undefined) {
      if (user) {
        cacheAuthUser(user as CachedAuthUser);
        cachedUser.current = user as CachedAuthUser;
        hasCached.current = true;
      } else if (!isAuthLoading) {
        // User explicitly logged out or token expired
        clearAuthCache();
        cachedUser.current = null;
        hasCached.current = false;
      }
    }
  }, [user, isAuthLoading]);

  // Clear cache on explicit sign-out
  const signOut = useCallback(async () => {
    clearAuthCache();
    cachedUser.current = null;
    hasCached.current = false;
    await convexSignOut();
  }, [convexSignOut]);

  // The real Convex user when available, cached user as fallback
  const effectiveUser = user ?? cachedUser.current;

  // isLoading is false if we have a cached session (prevents RequireAuth
  // redirect during Convex revalidation). If there is no cached session
  // at all, we must show the spinner until Convex resolves.
  const isLoading = isAuthLoading
    ? !hasCached.current     // show spinner only if there's no cached session
    : user === undefined;    // normal: waiting for useQuery to settle

  return {
    isLoading,
    isAuthenticated: isAuthenticated || (hasCached.current && !!cachedUser.current),
    user: effectiveUser,
    signIn,
    signOut,
  };
}
