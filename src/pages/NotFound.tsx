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
          <div className="flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#F4C430] to-yellow-600 text-[#0a0e1a] shadow-lg shadow-[#F4C430]/30">
            <CandlestickChart className="size-6" />
          </div>
          <h1 className="mt-5 text-5xl font-extrabold tracking-tight text-foreground">
            404
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This market isn&apos;t on any chart — the page you&apos;re looking
            for doesn&apos;t exist.
          </p>
          <Button
            asChild
            className="mt-6 rounded-xl bg-[#F4C430] text-[#0a0e1a] shadow-md shadow-[#F4C430]/30 hover:bg-[#F4C430]/85"
          >
            <Link to="/">Back to Ak Analyser</Link>
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
