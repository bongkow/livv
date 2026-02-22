"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthStore } from "@/stores/useAuthStore";
import ChatRoom from "@/components/ChatRoom";
import ConnectWalletButton from "@/components/ConnectWalletButton";

const DEFAULT_ROOM = "general";

function ChatPageContent() {
    const isConnected = useAuthStore((s) => s.isConnected);
    const router = useRouter();
    const searchParams = useSearchParams();
    const roomName = searchParams.get("room") || DEFAULT_ROOM;

    useEffect(() => {
        if (!isConnected) router.push("/");
    }, [isConnected, router]);

    if (!isConnected) return null;

    return (
        <div className="flex h-screen flex-col bg-black">
            {/* Header */}
            <header className="flex items-center justify-between border-b border-white/[0.08] px-5 py-3">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => router.push("/")}
                        className="text-sm font-medium text-white/80"
                    >
                        livv
                    </button>

                    <div className="h-3 w-px bg-white/10" />

                    <span className="text-xs text-white/30">
                        # {roomName}
                    </span>
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

export default function ChatPage() {
    return (
        <Suspense>
            <ChatPageContent />
        </Suspense>
    );
}
