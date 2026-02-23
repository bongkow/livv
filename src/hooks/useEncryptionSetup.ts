/**
 * Hook to orchestrate the encryption lifecycle on room join.
 *
 * Phase 1 (pre-connect): Derive key pair from wallet signature.
 *   This happens BEFORE the WebSocket connects, gating room entry.
 *
 * Phase 2 (post-connect): Broadcast public key and initialize protocol.
 *   - 1:1: X3DH handshake → Double Ratchet initialization
 *   - Group: Sender key creation → distribution to peers
 */

"use client";

import { useEffect, useCallback } from "react";
import { useEncryptionStore } from "@/stores/useEncryptionStore";
import type { RoomEncryptionMode } from "@/stores/useEncryptionStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { useWebSocketStore } from "@/stores/useWebSocketStore";

export function useEncryptionSetup(
    channelHash: string | null,
    roomEncryptionMode: RoomEncryptionMode | null
) {
    const walletAddress = useAuthStore((s) => s.walletAddress);
    const connectionStatus = useWebSocketStore((s) => s.connectionStatus);
    const sendWsMessage = useWebSocketStore((s) => s.sendMessage);

    const encryptionStatus = useEncryptionStore((s) => s.encryptionStatus);
    const encryptionKeyPair = useEncryptionStore((s) => s.encryptionKeyPair);
    const deriveKeyPair = useEncryptionStore((s) => s.deriveKeyPair);
    const initializeGroupSenderKey = useEncryptionStore((s) => s.initializeGroupSenderKey);
    const initiateDirectSession = useEncryptionStore((s) => s.initiateDirectSession);
    const reset = useEncryptionStore((s) => s.reset);

    // Phase 1: Derive key pair BEFORE WebSocket — only needs channelHash
    useEffect(() => {
        if (!channelHash || !roomEncryptionMode || encryptionStatus !== "idle") return;

        deriveKeyPair(channelHash);
    }, [channelHash, roomEncryptionMode, encryptionStatus, deriveKeyPair]);

    // Phase 2a: Broadcast public key after connecting to WebSocket
    useEffect(() => {
        if (
            connectionStatus !== "connected" ||
            encryptionStatus !== "handshaking" ||
            !encryptionKeyPair
        ) {
            return;
        }

        sendWsMessage("sendmessage", {
            type: "encryption_pubkey",
            publicKey: encryptionKeyPair.publicKey,
            sender: walletAddress,
        });
    }, [connectionStatus, encryptionStatus, encryptionKeyPair, sendWsMessage, walletAddress]);

    // Phase 2b: Initialize protocol based on room type
    const initializeEncryption = useCallback(async () => {
        if (
            connectionStatus !== "connected" ||
            encryptionStatus !== "handshaking" ||
            !encryptionKeyPair
        ) {
            return;
        }

        if (roomEncryptionMode === "group") {
            const { encryptedKeys } = await initializeGroupSenderKey(walletAddress);
            for (const encryptedKey of encryptedKeys) {
                sendWsMessage("sendmessage", {
                    type: "sender_key",
                    ...encryptedKey,
                    sender: walletAddress,
                });
            }
        }

        if (roomEncryptionMode === "direct") {
            const initMessage = await initiateDirectSession(walletAddress);
            if (initMessage) {
                sendWsMessage("sendmessage", {
                    type: "x3dh_init",
                    ...initMessage,
                    sender: walletAddress,
                });
            }
        }

        // Mark ready after handshake initiation.
        // For 1:1 rooms without a peer yet, the plaintext fallback will work.
        // When a peer responds, the Double Ratchet upgrades automatically.
        useEncryptionStore.setState({ encryptionStatus: "ready" });
    }, [
        connectionStatus,
        encryptionStatus,
        encryptionKeyPair,
        roomEncryptionMode,
        walletAddress,
        initializeGroupSenderKey,
        initiateDirectSession,
        sendWsMessage,
    ]);

    // Trigger protocol initialization after a short delay for peer key collection
    useEffect(() => {
        if (connectionStatus !== "connected" || encryptionStatus !== "handshaking") return;

        const timer = setTimeout(initializeEncryption, 1000);
        return () => clearTimeout(timer);
    }, [connectionStatus, encryptionStatus, initializeEncryption]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            reset();
        };
    }, [reset]);

    return {
        encryptionStatus,
        isEncryptionReady: encryptionStatus === "ready",
    };
}
