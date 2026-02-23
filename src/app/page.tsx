"use client";

import { useEffect } from "react";
import ConnectWalletButton from "@/components/ConnectWalletButton";
import RoomGrid from "@/components/RoomGrid";
import { useAuthStore } from "@/stores/useAuthStore";
import { useRouter } from "next/navigation";

export default function LandingPage() {
  const isConnected = useAuthStore((s) => s.isConnected);
  const validateSession = useAuthStore((s) => s.validateSession);
  const router = useRouter();

  // Validate wallet connection + token on page load
  useEffect(() => {
    if (isConnected) {
      validateSession();
    }
  }, [isConnected, validateSession]);

  const handleEnterRoom = (roomName: string, roomType: string) => {
    router.push(`/chat?room=${encodeURIComponent(roomName)}&type=${encodeURIComponent(roomType)}`);
  };

  return (
    <div className="flex min-h-screen flex-col bg-black">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-medium text-white/80">livv</h1>
          <span className="text-[11px] text-white/20">rooms</span>
        </div>
        <ConnectWalletButton />
      </header>

      {/* Room grid */}
      <main className="flex-1 p-5">
        <RoomGrid isSignedIn={isConnected} onEnterRoom={handleEnterRoom} />
      </main>

      {/* Footer */}
      <footer className="border-t border-white/[0.08] px-5 py-3">
        <div className="flex items-center gap-4 text-[11px] text-white/15">
          <span>real-time rooms</span>
          <span>·</span>
          <span>web3 auth</span>
          <span>·</span>
          <span>games coming soon</span>
        </div>
      </footer>
    </div>
  );
}
