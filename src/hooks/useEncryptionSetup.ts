/**
 * Hook to orchestrate the encryption lifecycle on room join.
 *
 * Phase 1 (pre-connect): Derive key pair from wallet signature.
 *   This happens BEFORE the WebSocket connects, gating room entry.
 *
 * Phase 2 (post-connect): Initialize protocol event-driven.
 *   Public keys are now piggy-backed on presence messages (user_joined / i_am_here),
 *   so we react to peer keys arriving via peerPublicKeys changes instead of
 *   using a blind 1-second timer.
 *
 *   - 1:1 (direct): X3DH handshake → Double Ratchet initialization
 *   - Group: Sender key creation → distribution to peers as their keys arrive
 */

"use client";

import { useEffect, useRef } from "react";
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
    const deriveKeyPair = useEncryptionStore((s) => s.deriveKeyPair);
    const reset = useEncryptionStore((s) => s.reset);
    const peerPublicKeys = useEncryptionStore((s) => s.peerPublicKeys);

    // Track which peers we've already initiated a handshake with
    const handshakedPeers = useRef<Set<string>>(new Set());

    // Phase 1: Derive key pair BEFORE WebSocket — only needs channelHash
    useEffect(() => {
        if (!channelHash || !roomEncryptionMode || encryptionStatus !== "idle") return;

        deriveKeyPair(channelHash);
    }, [channelHash, roomEncryptionMode, encryptionStatus, deriveKeyPair]);

    // Phase 2: React to peer public keys arriving and initiate handshake per-peer.
    // This replaces the old flow of: broadcast encryption_pubkey → wait 1s → init.
    // Now, as soon as a peer's key arrives via presence messages, we start immediately.
    useEffect(() => {
        if (
            connectionStatus !== "connected" ||
            (encryptionStatus !== "handshaking" && encryptionStatus !== "ready") ||
            !walletAddress
        ) {
            return;
        }

        const encryptionStore = useEncryptionStore.getState();
        const { encryptionKeyPair, encryptionMode } = encryptionStore;
        if (!encryptionKeyPair) return;

        const peerAddresses = Object.keys(peerPublicKeys);
        const newPeers = peerAddresses.filter(
            (addr) => !handshakedPeers.current.has(addr) && addr !== walletAddress.toLowerCase()
        );

        if (newPeers.length === 0) return;

        const mode = encryptionMode || (roomEncryptionMode === "group" ? "group" : "direct");

        (async () => {
            for (const peerAddr of newPeers) {
                handshakedPeers.current.add(peerAddr);

                if (mode === "group") {
                    // Initialize our sender key if not yet done, then distribute to this peer
                    let senderKeyState = encryptionStore.mySenderKeyState;
                    if (!senderKeyState) {
                        const result = await useEncryptionStore.getState().initializeGroupSenderKey(walletAddress);
                        senderKeyState = result.senderKey;
                        // Send existing encrypted keys (for peers that had keys before this call)
                        for (const encryptedKey of result.encryptedKeys) {
                            sendWsMessage("broadcastToChannel", {
                                type: "sender_key",
                                ...encryptedKey,
                                sender: walletAddress,
                            });
                        }
                    } else {
                        // Sender key already exists, just distribute to the new peer
                        const { encryptSenderKeyForPeer } = await import("@/crypto/senderKeyDistribution");
                        const encrypted = await encryptSenderKeyForPeer(
                            senderKeyState.chainKey,
                            encryptionKeyPair.privateKey,
                            peerPublicKeys[peerAddr],
                            walletAddress
                        );
                        sendWsMessage("broadcastToChannel", {
                            type: "sender_key",
                            ...encrypted,
                            sender: walletAddress,
                        });
                    }
                }

                if (mode === "direct") {
                    // Tiebreaker: only the lexicographically lower address initiates X3DH.
                    // The higher address waits for the x3dh_init message to avoid
                    // dual-initiation race conditions that produce mismatched root keys.
                    if (walletAddress.toLowerCase() < peerAddr.toLowerCase()) {
                        const initMessage = await useEncryptionStore.getState().initiateDirectSession(walletAddress);
                        if (initMessage) {
                            sendWsMessage("broadcastToChannel", {
                                type: "x3dh_init",
                                ...initMessage,
                                sender: walletAddress,
                            });
                        }
                    }
                }
            }

            // Mark ready after handshake initiation
            if (encryptionStatus === "handshaking") {
                useEncryptionStore.setState({ encryptionStatus: "ready" });
            }
        })();
    }, [connectionStatus, encryptionStatus, peerPublicKeys, walletAddress, roomEncryptionMode, sendWsMessage]);

    // Fallback: if no peers respond within 200ms, mark as ready so the
    // plaintext fallback works for empty rooms or peers without encryption.
    // This replaces the old 1-second blind wait — 200ms is enough for the
    // presence round-trip, and if a peer arrives later the effect above
    // will still initiate the handshake.
    useEffect(() => {
        if (connectionStatus !== "connected" || encryptionStatus !== "handshaking") return;

        const timer = setTimeout(() => {
            const current = useEncryptionStore.getState().encryptionStatus;
            if (current === "handshaking") {
                useEncryptionStore.setState({ encryptionStatus: "ready" });
            }
        }, 200);
        return () => clearTimeout(timer);
    }, [connectionStatus, encryptionStatus]);

    // Reset handshaked peers tracking on unmount
    useEffect(() => {
        return () => {
            handshakedPeers.current.clear();
            reset();
        };
    }, [reset]);

    return {
        encryptionStatus,
        isEncryptionReady: encryptionStatus === "ready",
    };
}
