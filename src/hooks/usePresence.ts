"use client";

import { useEffect, useRef } from "react";
import { useWebSocketStore } from "@/stores/useWebSocketStore";
import { useChatStore } from "@/stores/useChatStore";
import { useAuthStore } from "@/stores/useAuthStore";

/**
 * Broadcasts presence events so peers can discover who is in the channel.
 *
 * Protocol (pure client-side, uses existing broadcastToChannel route):
 *   1. On connect → broadcast `user_joined` with own address
 *   2. When receiving `user_joined` → add peer, respond with `i_am_here`
 *   3. When receiving `i_am_here`  → add peer (no reply, prevents loops)
 *   4. On beforeunload / disconnect → broadcast `user_left`
 */
export function usePresence() {
    const connectionStatus = useWebSocketStore((s) => s.connectionStatus);
    const sendMessage = useWebSocketStore((s) => s.sendMessage);
    const walletAddress = useAuthStore((s) => s.walletAddress);
    const addOnlineUser = useChatStore((s) => s.addOnlineUser);

    const hasBroadcastedJoin = useRef(false);

    // Announce self when connected
    useEffect(() => {
        if (connectionStatus !== "connected" || !walletAddress || hasBroadcastedJoin.current) return;

        hasBroadcastedJoin.current = true;

        // Add self to online list immediately
        addOnlineUser(walletAddress);

        // Tell everyone in the channel that we joined
        sendMessage("broadcastToChannel", {
            type: "user_joined",
            address: walletAddress,
        });
    }, [connectionStatus, walletAddress, sendMessage, addOnlineUser]);

    // Reset flag when disconnected so we re-announce on reconnect
    useEffect(() => {
        if (connectionStatus === "disconnected") {
            hasBroadcastedJoin.current = false;
        }
    }, [connectionStatus]);

    // Broadcast user_left on tab close / navigation
    useEffect(() => {
        if (!walletAddress) return;

        const handleBeforeUnload = () => {
            const { socket, connectionStatus: status } = useWebSocketStore.getState();
            if (socket && status === "connected") {
                const msg = JSON.stringify({
                    action: "broadcastToChannel",
                    type: "user_left",
                    address: walletAddress,
                });
                socket.send(msg);
            }
        };

        window.addEventListener("beforeunload", handleBeforeUnload);
        return () => window.removeEventListener("beforeunload", handleBeforeUnload);
    }, [walletAddress]);
}
