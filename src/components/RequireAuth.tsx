import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { toast } from "sonner";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useAuth();
  const location = useLocation();
  const wasAuthenticated = useRef(false);

  // If a session drops while the app is open (expired token / signed out in
  // another tab), tell the user why they are being sent back to sign-in
  // instead of silently bouncing them.
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      wasAuthenticated.current = true;
    } else if (!isLoading && !isAuthenticated && wasAuthenticated.current) {
      wasAuthenticated.current = false;
      toast.error("Your session expired — please sign in again.");
    }
  }, [isLoading, isAuthenticated]);

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  if (!isAuthenticated) {
    const returnTo = `${location.pathname}${location.search}`;
    return (
      <Navigate
        to={`/auth?returnTo=${encodeURIComponent(returnTo)}`}
        replace
      />
    );
  }

  return children;
}
