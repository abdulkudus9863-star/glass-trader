import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { MessagesSquare, SendHorizonal } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/hooks/use-auth";

export default function CommunityChat() {
  const messages = useQuery(api.chat.list, {});
  const send = useMutation(api.chat.send);
  const { user } = useAuth();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages?.length]);

  const myName =
    user?.name?.trim() || (user?.email ? user.email.split("@")[0] : "Guest");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      await send({ text: trimmed });
      setText("");
    } catch {
      /* toast not wired here — silently keep the draft */
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-2.5">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Community
          </p>
          <p className="text-[10px] text-muted-foreground">
            Live trading room
          </p>
        </div>
        <span className="relative flex size-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
        </span>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-3 p-3">
          {messages === undefined && (
            <p className="py-6 text-center text-xs text-muted-foreground">
              Connecting…
            </p>
          )}
          {messages?.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <MessagesSquare className="size-6 text-muted-foreground/50" />
              <p className="text-xs text-muted-foreground">
                No messages yet.
                <br />
                Say hi to the room!
              </p>
            </div>
          )}
          {messages?.map((m) => {
            const mine = m.authorName === myName;
            return (
              <div
                key={m._id}
                className={`flex items-start gap-2 ${mine ? "flex-row-reverse" : ""}`}
              >
                <Avatar className="mt-0.5 size-6 shrink-0">
                  <AvatarFallback className="bg-gradient-to-br from-[#F4C430] to-yellow-600 text-[9px] font-bold text-[#0a0e1a]">
                    {m.authorName.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div
                  className={`max-w-[80%] rounded-xl px-2.5 py-1.5 ${
                    mine
                      ? "rounded-tr-sm bg-[#F4C430] text-[#0a0e1a]"
                      : "rounded-tl-sm bg-white/10 text-slate-200"
                  }`}
                >
                  {!mine && (
                    <p className="mb-0.5 text-[10px] font-bold text-[#F4C430]">
                      {m.authorName}
                    </p>
                  )}
                  <p className="whitespace-pre-wrap break-words text-xs leading-5">
                    {m.text}
                  </p>
                  <p
                    className={`mt-0.5 text-right text-[9px] ${
                      mine ? "text-[#0a0e1a]/70" : "text-muted-foreground"
                    }`}
                  >
                    {new Date(m._creationTime).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-1.5 border-t border-border/60 p-2.5"
      >
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Message the room…"
          className="h-9 rounded-lg bg-white/5"
          maxLength={500}
        />
        <Button
          type="submit"
          size="icon"
          disabled={!text.trim() || sending}
          className="size-9 shrink-0 rounded-lg bg-[#F4C430] text-[#0a0e1a] hover:bg-[#F4C430]/85"
        >
          <SendHorizonal className="size-4" />
        </Button>
      </form>
    </div>
  );
}
