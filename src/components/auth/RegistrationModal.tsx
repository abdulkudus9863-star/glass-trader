import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { User, Mail, KeyRound, Rocket, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface RegistrationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRegister: (name: string, email: string, accessKey: string) => void;
}

export default function RegistrationModal({
  open,
  onOpenChange,
  onRegister,
}: RegistrationModalProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [accessKey, setAccessKey] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = () => {
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName) {
      setError("Please enter your full name.");
      return;
    }
    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }
    if (trimmedName.length < 2) {
      setError("Name must be at least 2 characters.");
      return;
    }

    setError(null);
    onRegister(trimmedName, trimmedEmail, accessKey.trim());
    onOpenChange(false);

    // Reset fields
    setName("");
    setEmail("");
    setAccessKey("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md border-[#1B263B] bg-[#0D1424] p-0 overflow-hidden">
        {/* Header gradient */}
        <div className="relative bg-gradient-to-r from-[#F4C430]/10 via-[#F4C430]/5 to-transparent px-6 pt-6 pb-4">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#F4C430] to-yellow-600 text-[#0a0e1a] shadow-lg shadow-[#F4C430]/20">
                <Rocket className="size-5" />
              </div>
              <div>
                <DialogTitle className="font-display text-lg font-bold tracking-tight text-foreground">
                  Engine Access Registration
                </DialogTitle>
                <DialogDescription className="text-[11px] text-muted-foreground">
                  Unlock the DEEEPR AI engine and all indicator features
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        {/* Welcome bonus badge */}
        <div className="mx-6 flex items-center gap-2 rounded-xl border border-[#00E676]/30 bg-[#00E676]/5 px-4 py-2.5">
          <ShieldCheck className="size-4 text-[#00E676]" />
          <p className="text-[11px] font-medium text-[#00E676]">
            Welcome bonus: <span className="font-bold">{WELCOME_BONUS} free tokens</span> credited on registration
          </p>
        </div>

        {/* Form */}
        <div className="flex flex-col gap-4 px-6 pb-6 pt-2">
          {/* Name */}
          <div>
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Full Name / Username
            </label>
            <div className="flex items-center gap-2 rounded-xl border border-[#1B263B] bg-[#050811]/70 px-3 focus-within:border-[#F4C430]/50 focus-within:ring-1 focus-within:ring-[#F4C430]/40">
              <User className="size-4 shrink-0 text-slate-500" />
              <input
                type="text"
                value={name}
                onChange={(e) => { setName(e.target.value); setError(null); }}
                placeholder="e.g. John Trader"
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
                onChange={(e) => { setEmail(e.target.value); setError(null); }}
                placeholder="you@example.com"
                className="h-10 w-full bg-transparent font-mono text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
            </div>
          </div>

          {/* Access Key */}
          <div>
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Access Key / Invite Code
              <span className="ml-1.5 text-slate-600">(optional)</span>
            </label>
            <div className="flex items-center gap-2 rounded-xl border border-[#1B263B] bg-[#050811]/70 px-3 focus-within:border-[#F4C430]/50 focus-within:ring-1 focus-within:ring-[#F4C430]/40">
              <KeyRound className="size-4 shrink-0 text-slate-500" />
              <input
                type="text"
                value={accessKey}
                onChange={(e) => setAccessKey(e.target.value)}
                placeholder="Enter key if you have one"
                className="h-10 w-full bg-transparent font-mono text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
            </div>
          </div>

          {/* Error */}
          {error && (
            <p className="flex items-center gap-1.5 text-xs font-medium text-[#FF1744]">
              {error}
            </p>
          )}

          {/* Submit */}
          <Button
            type="button"
            onClick={handleSubmit}
            className={cn(
              "flex h-11 items-center justify-center gap-2 rounded-xl font-display text-sm font-bold transition-all",
              "bg-[#F4C430] text-[#0a0e1a] shadow-md shadow-[#F4C430]/20 hover:bg-[#F4C430]/85 hover:shadow-lg",
            )}
          >
            <Rocket className="size-4" />
            Register for Access
          </Button>

          <p className="text-center text-[10px] text-muted-foreground">
            By registering you agree to the platform terms. Your data is stored locally on this device.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const WELCOME_BONUS = 25;
