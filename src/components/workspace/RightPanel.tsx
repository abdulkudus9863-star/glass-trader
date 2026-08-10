import { motion } from "framer-motion";
import { KeyRound, MessagesSquare, Star } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CommunityChat from "./CommunityChat";
import MyAccess from "./MyAccess";
import Watchlist from "./Watchlist";

interface RightPanelProps {
  activeSymbolId: string;
  onSelectSymbol: (id: string) => void;
}

export default function RightPanel({
  activeSymbolId,
  onSelectSymbol,
}: RightPanelProps) {
  return (
    <motion.aside
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 320, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ type: "spring", stiffness: 380, damping: 34 }}
      className="min-h-0 shrink-0 overflow-hidden"
    >
      <div className="glass flex h-full w-[320px] flex-col border-l border-white/10">
        <Tabs defaultValue="watchlist" className="flex h-full min-h-0 flex-col gap-0">
          <TabsList className="mx-2.5 mt-2.5 h-9 w-auto justify-start gap-1 rounded-xl bg-white/5 p-1">
            <TabsTrigger value="watchlist" className="h-7 gap-1 rounded-lg text-xs">
              <Star className="size-3.5" />
              Watchlist
            </TabsTrigger>
            <TabsTrigger value="chat" className="h-7 gap-1 rounded-lg text-xs">
              <MessagesSquare className="size-3.5" />
              Chat
            </TabsTrigger>
            <TabsTrigger value="access" className="h-7 gap-1 rounded-lg text-xs">
              <KeyRound className="size-3.5" />
              Access
            </TabsTrigger>
          </TabsList>
          <TabsContent value="watchlist" className="min-h-0 flex-1 overflow-y-auto">
            <Watchlist activeSymbolId={activeSymbolId} onSelectSymbol={onSelectSymbol} />
          </TabsContent>
          <TabsContent value="chat" className="min-h-0 flex-1 overflow-hidden">
            <CommunityChat />
          </TabsContent>
          <TabsContent value="access" className="min-h-0 flex-1 overflow-y-auto">
            <MyAccess />
          </TabsContent>
        </Tabs>
      </div>
    </motion.aside>
  );
}
