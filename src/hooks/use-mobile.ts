import { useEffect, useState } from "react";

/**
 * Simple hook that returns `true` when the viewport is narrower than
 * 768px (Tailwind's `md` breakpoint).  Listens to `resize` events
 * with a passive listener so it never blocks scrolling.
 */
export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < 768 : false,
  );

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const handler = () => setMobile(mq.matches);
    handler();
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return mobile;
}
