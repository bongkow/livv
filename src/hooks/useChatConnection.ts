"use client";

import { useEffect, useCallback } from "react";
import { useAuthStore } from "@/stores/useAuthStore";
import { useWebSocketStore } from "@/stores/useWebSocketStore";
import { useChatStore, deriveRoomType } from "@/stores/useChatStore";
import type { RoomType } from "@/stores/useChatStore";
import { appConfig } from "@/config/appConfig";
import { fetchRoomByName } from "@/app/actions/fetchRoom";
import { useEncryptionSetup } from "./useEncryptionSetup";
import { useEncryptionStore } from "@/stores/useEncryptionStore";
import type { RoomEncryptionMode } from "@/stores/useEncryptionStore";
import { useFileTransferStore } from "@/stores/useFileTransferStore";
import { usePresence } from "./usePresence";

/**
 * Map room type to encryption mode:
 * - "1:1" → direct encryption (Double Ratchet)
 * - "group" → group encryption (Sender Keys)
 */
function toEncryptionMode(roomType: RoomType): RoomEncryptionMode {
    return roomType === "group" ? "group" : "direct";
}

export function useChatConnection(roomName: string) {
    const jwt = useAuthStore((s) => s.jwt);
    const isConnected = useAuthStore((s) => s.isConnected);
    const walletAddress = useAuthStore((s) => s.walletAddress);

    const connectionStatus = useWebSocketStore((s) => s.connectionStatus);
    const connect = useWebSocketStore((s) => s.connect);
    const disconnect = useWebSocketStore((s) => s.disconnect);
    const sendWsMessage = useWebSocketStore((s) => s.sendMessage);

    const setCurrentRoom = useChatStore((s) => s.setCurrentRoom);
    const clearRoom = useChatStore((s) => s.clearRoom);
    const currentRoom = useChatStore((s) => s.currentRoom);
    const channelHash = currentRoom?.channel?.split("/").pop() ?? null;

    const isRoomFull = useChatStore((s) => {
        const room = s.currentRoom;
        return room ? s.onlineUsers.length > room.maxPeersPerRoom : false;
    });

    const roomType = deriveRoomType(currentRoom?.maxPeersPerRoom ?? 2);
    const encryptionMode = toEncryptionMode(roomType);
    const { encryptionStatus, isEncryptionReady } = useEncryptionSetup(channelHash, encryptionMode);
    const encryptOutgoing = useEncryptionStore((s) => s.encryptOutgoing);
    const resetEncryption = useEncryptionStore((s) => s.reset);

    // Keys are derived once encryptionStatus leaves "idle" and "deriving"
    const keysReady = encryptionStatus !== "idle" && encryptionStatus !== "deriving";

    // Presence: broadcast join/leave events to peers in the channel
    usePresence();

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

            const maxPeers = roomData.maxPeersPerRoom ?? 2;
            const channel = `${appConfig.appName}/${roomData.roomName}`;
            setCurrentRoom({
                name: roomData.roomName,
                channel,
                maxPeersPerRoom: maxPeers,
            });
        }

        fetchRoom();

        return () => {
            cancelled = true;
        };
    }, [isConnected, jwt, roomName, setCurrentRoom]);

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
    const updateMessageMedia = useChatStore((s) => s.updateMessageMedia);
    const sendFileTransfer = useFileTransferStore((s) => s.sendFile);

    /** Gracefully leave the room: broadcast user_left, disconnect WS, reset state */
    const exitRoom = useCallback(() => {
        // Broadcast user_left so peers know we left
        if (connectionStatus === "connected" && walletAddress) {
            sendWsMessage("broadcastToChannel", {
                type: "user_left",
                address: walletAddress,
            });
        }

        // Small delay so the WebSocket flushes the user_left message before teardown
        setTimeout(() => {
            disconnect();
            resetEncryption();
            clearRoom();
        }, 150);
    }, [connectionStatus, walletAddress, sendWsMessage, disconnect, resetEncryption, clearRoom]);

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
                try {
                    const encrypted = await encryptOutgoing(text, walletAddress);
                    if (encrypted) {
                        sendWsMessage("broadcastToChannel", {
                            ...encrypted,
                            sender: walletAddress,
                            type: "chat",
                        });
                        return;
                    }
                } catch (err) {
                    console.warn("[encryption] encrypt failed, falling back to plaintext:", err);
                }
            }

            // Plaintext fallback (encryption not ready)
            sendWsMessage("broadcastToChannel", {
                text,
                sender: walletAddress,
                type: "chat",
            });
        },
        [sendWsMessage, walletAddress, isEncryptionReady, encryptOutgoing, addMessage]
    );

    /** Send an image or video file (chunked + encrypted). */
    const sendFile = useCallback(
        async (file: File) => {
            await sendFileTransfer(
                file,
                walletAddress,
                sendWsMessage,
                isEncryptionReady
                    ? (plaintext: string, sender: string) =>
                        encryptOutgoing(plaintext, sender) as Promise<Record<string, unknown> | null>
                    : null,
                addMessage,
                updateMessageMedia,
            );
        },
        [sendFileTransfer, walletAddress, sendWsMessage, isEncryptionReady, encryptOutgoing, addMessage, updateMessageMedia]
    );

    return { connectionStatus, encryptionStatus, isEncryptionReady, isRoomFull, sendChatMessage, sendFile, exitRoom };
}
