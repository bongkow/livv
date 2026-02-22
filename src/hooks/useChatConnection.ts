"use client";

import { useEffect, useCallback } from "react";
import { useAuthStore } from "@/stores/useAuthStore";
import { useWebSocketStore } from "@/stores/useWebSocketStore";
import { useChatStore } from "@/stores/useChatStore";
import type { RoomType } from "@/stores/useChatStore";
import { appConfig } from "@/config/appConfig";
import { fetchRoomByName } from "@/app/actions/fetchRoom";

export function useChatConnection(roomName: string, roomType: RoomType = "public") {
    const jwt = useAuthStore((s) => s.jwt);
    const isConnected = useAuthStore((s) => s.isConnected);
    const walletAddress = useAuthStore((s) => s.walletAddress);

    const connectionStatus = useWebSocketStore((s) => s.connectionStatus);
    const connect = useWebSocketStore((s) => s.connect);
    const disconnect = useWebSocketStore((s) => s.disconnect);
    const sendWsMessage = useWebSocketStore((s) => s.sendMessage);

    const setCurrentRoom = useChatStore((s) => s.setCurrentRoom);

    useEffect(() => {
        if (!isConnected || !jwt || !roomName) return;

        let cancelled = false;

        async function initConnection() {
            // Fetch room from DynamoDB via server action
            const roomData = await fetchRoomByName(roomName);
            if (cancelled) return;

            if (!roomData) {
                console.warn(`Room "${roomName}" not found in database`);
                return;
            }

            const channel = `${appConfig.appName}/${roomData.channelHash}`;
            setCurrentRoom({ name: roomData.roomName, type: roomType, channel });
            connect(jwt, channel);
        }

        initConnection();

        return () => {
            cancelled = true;
            disconnect();
        };
    }, [isConnected, jwt, roomName, roomType, connect, disconnect, setCurrentRoom]);

    const sendChatMessage = useCallback(
        (text: string) => {
            if (!text.trim()) return;
            sendWsMessage("sendmessage", {
                message: text,
                sender: walletAddress,
                type: "chat",
            });
        },
        [sendWsMessage, walletAddress]
    );

    return { connectionStatus, sendChatMessage };
}
