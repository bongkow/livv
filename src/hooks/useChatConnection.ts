"use client";

import { useEffect, useCallback } from "react";
import { useAuthStore } from "@/stores/useAuthStore";
import { useWebSocketStore } from "@/stores/useWebSocketStore";
import { useChatStore } from "@/stores/useChatStore";
import type { RoomType } from "@/stores/useChatStore";
import { appConfig } from "@/config/appConfig";
import { fetchRoomByName } from "@/app/actions/fetchRoom";
import { useEncryptionSetup } from "./useEncryptionSetup";
import { useEncryptionStore } from "@/stores/useEncryptionStore";
import type { RoomEncryptionMode } from "@/stores/useEncryptionStore";

/**
 * Map room type to encryption mode:
 * - "1:1" → direct encryption (Double Ratchet)
 * - "group" → group encryption (Sender Keys)
 */
function toEncryptionMode(roomType: RoomType): RoomEncryptionMode {
    return roomType === "group" ? "group" : "direct";
}

export function useChatConnection(roomName: string, roomType: RoomType = "1:1") {
    const jwt = useAuthStore((s) => s.jwt);
    const isConnected = useAuthStore((s) => s.isConnected);
    const walletAddress = useAuthStore((s) => s.walletAddress);

    const connectionStatus = useWebSocketStore((s) => s.connectionStatus);
    const connect = useWebSocketStore((s) => s.connect);
    const disconnect = useWebSocketStore((s) => s.disconnect);
    const sendWsMessage = useWebSocketStore((s) => s.sendMessage);

    const setCurrentRoom = useChatStore((s) => s.setCurrentRoom);
    const currentRoom = useChatStore((s) => s.currentRoom);
    const channelHash = currentRoom?.channel?.split("/").pop() ?? null;

    const encryptionMode = toEncryptionMode(roomType);
    const { encryptionStatus, isEncryptionReady } = useEncryptionSetup(channelHash, encryptionMode);
    const encryptOutgoing = useEncryptionStore((s) => s.encryptOutgoing);

    // Keys are derived once encryptionStatus leaves "idle" and "deriving"
    const keysReady = encryptionStatus !== "idle" && encryptionStatus !== "deriving";

    // Step 1: Fetch room data and set current room (no WebSocket yet)
    useEffect(() => {
        if (!isConnected || !jwt || !roomName) return;

        let cancelled = false;

        async function fetchRoom() {
            const roomData = await fetchRoomByName(roomName);
            if (cancelled) return;

            if (!roomData) {
                console.warn(`Room "${roomName}" not found in database`);
                return;
            }

            const channel = `${appConfig.appName}/${roomData.channelHash}`;
            setCurrentRoom({ name: roomData.roomName, type: roomType, channel });
        }

        fetchRoom();

        return () => {
            cancelled = true;
        };
    }, [isConnected, jwt, roomName, roomType, setCurrentRoom]);

    // Step 2: Connect WebSocket ONLY after encryption keys are derived.
    // Uses a boolean gate so that further encryptionStatus changes (handshaking→ready)
    // do NOT cause a disconnect/reconnect cycle.
    useEffect(() => {
        if (!jwt || !currentRoom?.channel || !keysReady) return;

        connect(jwt, currentRoom.channel);

        return () => {
            disconnect();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [jwt, currentRoom?.channel, keysReady]);

    const addMessage = useChatStore((s) => s.addMessage);

    const sendChatMessage = useCallback(
        async (text: string) => {
            if (!text.trim()) return;

            // Add message to local store immediately (sender echo)
            addMessage({
                id: crypto.randomUUID(),
                sender: walletAddress,
                content: text,
                timestamp: Date.now(),
                encrypted: isEncryptionReady,
            });

            if (isEncryptionReady) {
                const encrypted = await encryptOutgoing(text, walletAddress);
                if (encrypted) {
                    sendWsMessage("broadcastToChannel", {
                        ...encrypted,
                        sender: walletAddress,
                        type: "chat",
                    });
                    return;
                }
            }

            // Plaintext fallback (encryption not ready)
            sendWsMessage("broadcastToChannel", {
                message: text,
                sender: walletAddress,
                type: "chat",
            });
        },
        [sendWsMessage, walletAddress, isEncryptionReady, encryptOutgoing, addMessage]
    );

    return { connectionStatus, encryptionStatus, isEncryptionReady, sendChatMessage };
}
