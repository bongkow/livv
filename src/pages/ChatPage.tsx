import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "@/stores/useAuthStore";
import ChatRoom from "@/components/ChatRoom";
import ConnectWalletButton from "@/components/ConnectWalletButton";

const DEFAULT_ROOM = "general";

export default function ChatPage() {
  const isConnected = useAuthStore((s) => s.isConnected);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const roomName = searchParams.get("room") || DEFAULT_ROOM;

  useEffect(() => {
    if (!isConnected) navigate("/");
  }, [isConnected, navigate]);

  if (!isConnected) return null;

  return (
    <div className="flex h-screen flex-col bg-black">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-white/[0.08] px-5 py-3">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/")}
            className="text-sm font-medium text-white/80"
          >
            livv
          </button>

          <div className="h-3 w-px bg-white/10" />

          <span className="text-xs text-white/30"># {roomName}</span>
        </div>

        <ConnectWalletButton />
      </header>

      {/* Chat */}
      <main className="flex-1 overflow-hidden">
        <ChatRoom roomName={roomName} />
      </main>
    </div>
  );
}
