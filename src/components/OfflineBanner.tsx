import { WifiOff } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * Slim application-wide banner for network disconnections.
 *
 * Convex reconnects automatically, and every data hook already renders its own
 * stale/error state — this simply tells the user why data stopped updating
 * instead of leaving them guessing.
 */
export default function OfflineBanner() {
  const [offline, setOffline] = useState(
    () => typeof navigator !== "undefined" && navigator.onLine === false,
  );

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 bg-[#F4C430] px-4 py-1.5 text-[11px] font-bold text-[#0a0e1a] shadow-lg"
    >
      <WifiOff className="size-3.5" />
      You are offline — live data is paused and will resume automatically
      when the connection returns.
    </div>
  );
}
