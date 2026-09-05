import { useState } from "react";
import { useNavigate } from "react-router";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  CandlestickChart,
  KeyRound,
  Mail,
  Rocket,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const AUTH_CACHE_KEY = "auth_user";
const AUTH_SESSION_KEY = "auth_session_active";
const REGISTRATION_KEY = "akt_registered_user";
const WELCOME_TOKENS = 50;

interface AccessTerminalModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function AccessTerminalModal({
  open,
  onOpenChange,
}: AccessTerminalModalProps) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"register" | "signin">("register");

  // --- Register fields ---
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const resetFields = () => {
    setUsername("");
    setEmail("");
    setInviteCode("");
    setError(null);
  };

  const handleRegister = () => {
    const trimName = username.trim();
    const trimEmail = email.trim();

    if (!trimName || trimName.length < 2) {
      setError("Username must be at least 2 characters.");
      return;
    }
    if (!trimEmail || !trimEmail.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }

    // Save auth session to localStorage
    const fakeId = `user_${Date.now().toString(36)}`;
    const authUser = {
      _id: fakeId,
      name: trimName,
      email: trimEmail.toLowerCase(),
      isFounder: false,
      role: "user",
    };

    try {
      localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(authUser));
      localStorage.setItem(AUTH_SESSION_KEY, "1");
      localStorage.setItem(
        REGISTRATION_KEY,
        JSON.stringify({
          name: trimName,
          email: trimEmail.toLowerCase(),
          accessKey: inviteCode.trim(),
          registeredAt: Date.now(),
        }),
      );
    } catch {
      // storage unavailable — continue anyway
    }

    toast.success(`Access granted. Welcome, ${trimName}!`);
    resetFields();
    onOpenChange(false);
    navigate("/charts");
  };

  const handleSignIn = () => {
    // Redirect to the real auth page for Convex-based sign-in
    resetFields();
    onOpenChange(false);
    navigate("/auth?returnTo=/charts");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) resetFields();
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-md overflow-hidden border-[#1B263B] bg-[#0D1424] p-0">
        {/* Header with gradient */}
        <div className="relative bg-gradient-to-r from-[#F4C430]/10 via-[#F4C430]/5 to-transparent px-6 pt-6 pb-4">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#F4C430] to-yellow-600 text-[#0a0e1a] shadow-lg shadow-[#F4C430]/20">
                <CandlestickChart className="size-5" />
              </div>
              <div>
                <DialogTitle className="font-display text-lg font-bold tracking-tight text-foreground">
                  {mode === "register"
                    ? "Get Access to AK Analyser Engine"
                    : "Welcome Back"}
                </DialogTitle>
                <DialogDescription className="text-[11px] text-muted-foreground">
                  {mode === "register"
                    ? "Create your account to unlock real-time multi-lane market intelligence."
                    : "Sign in to continue to the trading terminal."}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        {/* Welcome bonus badge (register only) */}
        {mode === "register" && (
          <div className="mx-6 flex items-center gap-2 rounded-xl border border-[#00E676]/30 bg-[#00E676]/5 px-4 py-2.5">
            <Rocket className="size-4 text-[#00E676]" />
            <p className="text-[11px] font-medium text-[#00E676]">
              Welcome bonus: <span className="font-bold">{WELCOME_TOKENS} free tokens</span> on signup
            </p>
          </div>
        )}

        {/* Form */}
        <div className="flex flex-col gap-4 px-6 pb-6 pt-2">
          {mode === "register" ? (
            <>
              {/* Username */}
              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Username / Trader Handle
                </label>
                <div className="flex items-center gap-2 rounded-xl border border-[#1B263B] bg-[#050811]/70 px-3 focus-within:border-[#F4C430]/50 focus-within:ring-1 focus-within:ring-[#F4C430]/40">
                  <User className="size-4 shrink-0 text-slate-500" />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      setError(null);
                    }}
                    placeholder="e.g. CryptoTrader01"
                    className="h-10 w-full bg-transparent font-mono text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none"
                    autoFocus
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Email Address
                </label>
                <div className="flex items-center gap-2 rounded-xl border border-[#1B263B] bg-[#050811]/70 px-3 focus-within:border-[#F4C430]/50 focus-within:ring-1 focus-within:ring-[#F4C430]/40">
                  <Mail className="size-4 shrink-0 text-slate-500" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setError(null);
                    }}
                    placeholder="you@example.com"
                    className="h-10 w-full bg-transparent font-mono text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none"
                  />
                </div>
              </div>

              {/* Invite Code */}
              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Invite Code / Access Key
                  <span className="ml-1.5 text-slate-600">(optional)</span>
                </label>
                <div className="flex items-center gap-2 rounded-xl border border-[#1B263B] bg-[#050811]/70 px-3 focus-within:border-[#F4C430]/50 focus-within:ring-1 focus-within:ring-[#F4C430]/40">
                  <KeyRound className="size-4 shrink-0 text-slate-500" />
                  <input
                    type="text"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    placeholder="Enter key if you have one"
                    className="h-10 w-full bg-transparent font-mono text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none"
                  />
                </div>
              </div>
            </>
          ) : (
            /* Sign In mode — redirect to real auth */
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="flex size-14 items-center justify-center rounded-2xl bg-[#F4C430]/10 ring-1 ring-[#F4C430]/25">
                <CandlestickChart className="size-7 text-[#F4C430]" />
              </div>
              <p className="text-center text-sm leading-6 text-slate-400">
                Sign in with your email to access the full DEEEPR AI terminal
                with real-time charts, radar, and the strategy compiler.
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="flex items-center gap-1.5 text-xs font-medium text-[#FF1744]">
              {error}
            </p>
          )}

          {/* Submit */}
          {mode === "register" ? (
            <Button
              type="button"
              onClick={handleRegister}
              className={cn(
                "flex h-11 items-center justify-center gap-2 rounded-xl font-display text-sm font-bold transition-all",
                "bg-[#F4C430] text-[#0a0e1a] shadow-md shadow-[#F4C430]/20 hover:bg-[#F4C430]/85 hover:shadow-lg",
              )}
            >
              <Rocket className="size-4" />
              Create Account & Enter Terminal
            </Button>
          ) : (
            <Button
              type="button"
              onClick={handleSignIn}
              className={cn(
                "flex h-11 items-center justify-center gap-2 rounded-xl font-display text-sm font-bold transition-all",
                "bg-[#F4C430] text-[#0a0e1a] shadow-md shadow-[#F4C430]/20 hover:bg-[#F4C430]/85 hover:shadow-lg",
              )}
            >
              Sign In to Terminal
            </Button>
          )}

          {/* Toggle link */}
          <p className="text-center text-xs text-slate-500">
            {mode === "register" ? (
              <>
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => {
                    resetFields();
                    setMode("signin");
                  }}
                  className="font-semibold text-[#F4C430] transition-colors hover:text-[#F4C430]/80"
                >
                  Sign In
                </button>
              </>
            ) : (
              <>
                Don&apos;t have an account?{" "}
                <button
                  type="button"
                  onClick={() => {
                    resetFields();
                    setMode("register");
                  }}
                  className="font-semibold text-[#F4C430] transition-colors hover:text-[#F4C430]/80"
                >
                  Create Account
                </button>
              </>
            )}
          </p>

          <p className="text-center text-[10px] text-muted-foreground">
            By registering you agree to the platform terms. Your data is stored
            locally on this device.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
