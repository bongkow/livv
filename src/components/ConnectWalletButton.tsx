"use client";

import { useState } from "react";
import { useAuthStore } from "@/stores/useAuthStore";
import { useWebSocketStore } from "@/stores/useWebSocketStore";
import { truncateAddress } from "@/utils/truncateAddress";
import FaceAvatar from "./FaceAvatar";
import PeerSettingsModal from "./PeerSettingsModal";

const WS_RING_STYLES: Record<string, string> = {
    connected:
        "ring-2 ring-green-400 shadow-[0_0_8px_rgba(34,197,94,0.6),0_0_20px_rgba(34,197,94,0.25)]",
    connecting:
        "ring-2 ring-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.6),0_0_20px_rgba(250,204,21,0.25)] animate-pulse",
    disconnected:
        "ring-2 ring-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6),0_0_20px_rgba(239,68,68,0.25)]",
};

const WS_STATUS_LABELS: Record<string, string> = {
    connected: "WebSocket connected",
    connecting: "WebSocket connecting…",
    disconnected: "WebSocket disconnected",
};

export default function ConnectWalletButton() {
    const { isConnected, isAuthenticating, walletAddress, errorMessage, connectAndSignIn, signOut } =
        useAuthStore();
    const connectionStatus = useWebSocketStore((s) => s.connectionStatus);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    if (isConnected) {
        return (
            <>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setIsSettingsOpen(true)}
                        title={WS_STATUS_LABELS[connectionStatus]}
                        className={`inline-flex rounded-full shrink-0 transition-shadow duration-300 cursor-pointer ${WS_RING_STYLES[connectionStatus]}`}
                    >
                        <FaceAvatar address={walletAddress} size={36} />
                    </button>
                    <span className="text-sm text-white/50 font-mono">
                        {truncateAddress(walletAddress)}
                    </span>
                    <button
                        onClick={signOut}
                        className="text-xs text-white/30 hover:text-white transition-colors"
                    >
                        disconnect
                    </button>
                </div>
                <PeerSettingsModal
                    isOpen={isSettingsOpen}
                    onClose={() => setIsSettingsOpen(false)}
                />
            </>
        );
    }

    return (
        <div className="flex flex-col items-center gap-2">
            <button
                onClick={connectAndSignIn}
                disabled={isAuthenticating}
                className="border border-white/20 px-6 py-2.5 text-sm font-medium text-white hover:bg-white hover:text-black transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
            >
                {isAuthenticating ? "Signing in..." : "Connect Wallet"}
            </button>
            {errorMessage && (
                <p className="text-xs text-white/40">{errorMessage}</p>
            )}
        </div>
    );
}
