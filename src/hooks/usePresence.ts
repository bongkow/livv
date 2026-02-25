"use client";

import { useEffect, useRef } from "react";
import { useWebSocketStore } from "@/stores/useWebSocketStore";
import { useChatStore } from "@/stores/useChatStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { useEncryptionStore } from "@/stores/useEncryptionStore";

/**
 * Broadcasts presence events so peers can discover who is in the channel.
 *
 * Protocol (pure client-side, uses existing broadcastToChannel route):
 *   1. On connect → broadcast `user_joined` with own address + publicKey
 *   2. When receiving `user_joined` → add peer + store key, respond with `i_am_here` + publicKey
 *   3. When receiving `i_am_here`  → add peer + store key (no reply, prevents loops)
 *   4. On beforeunload / disconnect → broadcast `user_left`
 *
 * Public keys are piggy-backed on presence messages to eliminate the separate
 * `encryption_pubkey` broadcast and the 1-second blind wait that followed it.
 */
export function usePresence() {
    const connectionStatus = useWebSocketStore((s) => s.connectionStatus);
    const sendMessage = useWebSocketStore((s) => s.sendMessage);
    const walletAddress = useAuthStore((s) => s.walletAddress);
    const addOnlineUser = useChatStore((s) => s.addOnlineUser);
    const encryptionKeyPair = useEncryptionStore((s) => s.encryptionKeyPair);

    const hasBroadcastedJoin = useRef(false);

    // Announce self when connected (includes public key for encryption setup)
    useEffect(() => {
        if (connectionStatus !== "connected" || !walletAddress || hasBroadcastedJoin.current) return;

        hasBroadcastedJoin.current = true;

        // Add self to online list immediately
        addOnlineUser(walletAddress);

        // Tell everyone in the channel that we joined (include public key if available)
        sendMessage("broadcastToChannel", {
            type: "user_joined",
            address: walletAddress,
            ...(encryptionKeyPair ? { publicKey: encryptionKeyPair.publicKey } : {}),
        });
    }, [connectionStatus, walletAddress, sendMessage, addOnlineUser, encryptionKeyPair]);

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
