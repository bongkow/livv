"use client";

import { useAuthStore } from "@/stores/useAuthStore";
import { useWebSocketStore } from "@/stores/useWebSocketStore";
import { truncateAddress } from "@/utils/truncateAddress";

const WS_STATUS_STYLES: Record<string, string> = {
    connected: "bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.6)]",
    connecting: "bg-yellow-400 shadow-[0_0_6px_rgba(250,204,21,0.6)] animate-pulse",
    disconnected: "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.6)]",
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

    if (isConnected) {
        return (
            <div className="flex items-center gap-3">
                <span
                    title={WS_STATUS_LABELS[connectionStatus]}
                    className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${WS_STATUS_STYLES[connectionStatus]}`}
                />
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
