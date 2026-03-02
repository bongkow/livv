/*
 * @Module: RoomsPage
 * @Purpose: Lists all available chat rooms for users to browse and enter
 * @Logic: Validates session, renders room grid. Redirects unauthenticated users to landing page.
 * @Interfaces: default export RoomsPage
 * @Constraints: Requires wallet connection via useAuthStore
 */
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import ConnectWalletButton from "@/components/ConnectWalletButton";
import RoomGrid from "@/components/RoomGrid";
import { useAuthStore } from "@/stores/useAuthStore";
import { appConfig } from "@/config/appConfig";
import AppLogo from "@/components/AppLogo";

export default function RoomsPage() {
    const isConnected = useAuthStore((s) => s.isConnected);
    const validateSession = useAuthStore((s) => s.validateSession);
    const router = useRouter();

    useEffect(() => {
        const check = async () => {
            if (isConnected && !(await validateSession())) {
                router.push("/");
                return;
            }
            if (!isConnected) router.push("/");
        };
        check();
    }, [isConnected, validateSession, router]);

    const handleEnterRoom = (roomName: string) => {
        router.push(`/chat?room=${encodeURIComponent(roomName)}`);
    };

    if (!isConnected) return null;

    return (
        <div className="flex min-h-screen flex-col bg-black">
            {/* Header */}
            <header className="flex items-center justify-between border-b border-white/[0.08] backdrop-blur-md bg-black/50 px-5 py-4">
                <div className="flex items-center gap-4">
                    <AppLogo size={24} />
                    <button
                        onClick={() => router.push("/")}
                        className="text-base font-light tracking-wide text-white/80 hover:text-white transition-colors"
                    >
                        livv
                    </button>
                    <span className="text-[10px] text-white/20 font-mono">v{appConfig.appVersion}</span>
                    <div className="h-3 w-px bg-white/10" />
                    <span className="text-xs text-white/30">rooms</span>
                </div>
                <ConnectWalletButton />
            </header>

            {/* Room grid */}
            <main className="flex-1 px-5 py-8">
                <div className="flex items-baseline justify-between mb-6">
                    <h2 className="text-xs font-medium text-white/30 uppercase tracking-widest">
                        Available Rooms
                    </h2>
                </div>
                <RoomGrid isSignedIn={isConnected} onEnterRoom={handleEnterRoom} />
            </main>
        </div>
    );
}
