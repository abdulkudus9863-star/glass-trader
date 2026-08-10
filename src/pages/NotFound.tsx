import { motion } from "framer-motion";
import { CandlestickChart } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="bg-aurora" />
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4"
      >
        <div className="glass-strong flex w-full max-w-md flex-col items-center rounded-2xl px-8 py-12 text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-sky-400 text-white shadow-lg shadow-indigo-500/30">
            <CandlestickChart className="size-6" />
          </div>
          <h1 className="mt-5 text-5xl font-extrabold tracking-tight text-foreground">
            404
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This chart doesn&apos;t exist — the market you&apos;re looking for
            isn&apos;t on this page.
          </p>
          <Button
            asChild
            className="mt-6 rounded-xl bg-indigo-500 shadow-md shadow-indigo-500/30 hover:bg-indigo-400"
          >
            <Link to="/">Back to TradeDeck</Link>
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
