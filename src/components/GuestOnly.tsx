import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { Navigate } from "react-router";

/**
 * Guests see the landing page; signed-in users go straight to the dashboard.
 *
 * During a page reload the auth cache rehydrates synchronously, so a returning
 * user does not flash the marketing page before being forwarded.
 */
export function GuestOnly({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
