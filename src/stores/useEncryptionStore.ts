/**
 * Encryption state management — Zustand store.
 *
 * Manages the full encryption lifecycle for both
 * Double Ratchet (1:1) and Sender Keys (group) protocols.
 *
 * Keeps all crypto state in-memory only (no persistence).
 */

import { create } from "zustand";
import { BrowserProvider } from "ethers";
import {
    generateEncryptionKeyPair,
    deriveRoomKeyPairFromMasterSeed,
} from "@/crypto/generateEncryptionKeyPair";
import { appConfig } from "@/config/appConfig";
import { useAuthStore } from "@/stores/useAuthStore";
import {
    createSenderKeyState,
    encryptWithSenderKey,
    decryptWithSenderKey,
} from "@/crypto/senderKeyRatchet";
import {
    encryptSenderKeyForPeer,
    decryptSenderKeyFromPeer,
} from "@/crypto/senderKeyDistribution";
import {
    createX3DHInitMessage,
    respondToX3DH,
    completeX3DH,
} from "@/crypto/x3dh";
import {
    initializeDoubleRatchet,
    encryptWithDoubleRatchet,
    decryptWithDoubleRatchet,
} from "@/crypto/doubleRatchet";
import { exportPublicKey } from "@/crypto/deriveSharedSecret";
import type {
    EncryptionKeyPair,
    SenderKeyState,
    DoubleRatchetState,
    EncryptedMessage,
    DoubleRatchetMessage,
    EncryptedSenderKey,
    X3DHInitMessage,
    X3DHResponseMessage,
} from "@/crypto/types";

export type EncryptionStatus = "idle" | "deriving" | "handshaking" | "ready" | "error";
export type RoomEncryptionMode = "direct" | "group";

interface EncryptionState {
    encryptionKeyPair: EncryptionKeyPair | null;
    encryptionStatus: EncryptionStatus;
    encryptionMode: RoomEncryptionMode | null;
    errorMessage: string;

    // Peer public keys (address → JWK)
    peerPublicKeys: Record<string, JsonWebKey>;

    // 1:1 Double Ratchet
    doubleRatchetState: DoubleRatchetState | null;
    pendingX3DHEphemeralKeyPair: CryptoKeyPair | null;

    // Group Sender Keys
    mySenderKeyState: SenderKeyState | null;
    peerSenderKeys: Record<string, SenderKeyState>;
}

interface EncryptionActions {
    /** Derive ECDH key pair from Ethereum wallet signature */
    deriveKeyPair: (channelHash: string) => Promise<void>;

    /** Store a peer's ECDH public key */
    addPeerPublicKey: (address: string, publicKey: JsonWebKey) => void;
    removePeerPublicKey: (address: string) => void;

    /** 1:1: Initiate X3DH handshake */
    initiateDirectSession: (peerAddress: string) => Promise<X3DHInitMessage | null>;
    /** 1:1: Respond to X3DH handshake */
    respondToDirectSession: (
        initMessage: X3DHInitMessage,
        myAddress: string
    ) => Promise<X3DHResponseMessage | null>;
    /** 1:1: Complete X3DH handshake (initiator side) */
    completeDirectSession: (response: X3DHResponseMessage) => Promise<void>;

    /** Group: Initialize sender key and return encrypted keys for all peers */
    initializeGroupSenderKey: (
        myAddress: string
    ) => Promise<{ senderKey: SenderKeyState; encryptedKeys: EncryptedSenderKey[] }>;
    /** Group: Handle received sender key from a peer */
    handleReceivedSenderKey: (
        encrypted: EncryptedSenderKey,
        peerPublicKey: JsonWebKey
    ) => Promise<void>;

    /** Encrypt outgoing message (dispatches to correct protocol) */
    encryptOutgoing: (
        plaintext: string,
        senderAddress: string
    ) => Promise<EncryptedMessage | DoubleRatchetMessage | null>;

    /** Decrypt incoming message (dispatches to correct protocol) */
    decryptIncoming: (
        data: Record<string, unknown>
    ) => Promise<string | null>;

    /** Re-key all sender keys on member leave (group) */
    rekeyOnMemberLeave: (leftAddress: string, myAddress: string) => Promise<EncryptedSenderKey[]>;

    /** Reset all encryption state */
    reset: () => void;
}

type EncryptionStore = EncryptionState & EncryptionActions;

const INITIAL_STATE: EncryptionState = {
    encryptionKeyPair: null,
    encryptionStatus: "idle",
    encryptionMode: null,
    errorMessage: "",
    peerPublicKeys: {},
    doubleRatchetState: null,
    pendingX3DHEphemeralKeyPair: null,
    mySenderKeyState: null,
    peerSenderKeys: {},
};

export const useEncryptionStore = create<EncryptionStore>()((set, get) => ({
    ...INITIAL_STATE,

    deriveKeyPair: async (channelHash: string) => {
        set({ encryptionStatus: "deriving", errorMessage: "" });

        try {
            const walletAddress = useAuthStore.getState().walletAddress;
            const seedKey = appConfig.getMasterSeedStorageKey(walletAddress);
            let masterSeedHex = localStorage.getItem(seedKey);

            if (masterSeedHex) {
                // Fast path: derive room key from cached master seed — no wallet popup
                const keyPair = await deriveRoomKeyPairFromMasterSeed(masterSeedHex, channelHash);
                set({ encryptionKeyPair: keyPair, encryptionStatus: "handshaking" });
                return;
            }

            // Fallback: master seed not cached yet (pre-update session).
            // Sign the master E2E message once, cache the seed, then derive.
            const ethereum = (
                window as unknown as {
                    ethereum?: {
                        request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
                    };
                }
            ).ethereum;

            if (!ethereum) {
                throw new Error("No Ethereum wallet found");
            }

            const provider = new BrowserProvider(ethereum as never);
            const signer = await provider.getSigner();
            const e2eSignature = await signer.signMessage(appConfig.masterE2ESignMessage);
            const seedBuffer = await crypto.subtle.digest(
                "SHA-256",
                new TextEncoder().encode(e2eSignature)
            );
            masterSeedHex = Array.from(new Uint8Array(seedBuffer))
                .map((b) => b.toString(16).padStart(2, "0"))
                .join("");
            localStorage.setItem(seedKey, masterSeedHex);

            const keyPair = await deriveRoomKeyPairFromMasterSeed(masterSeedHex, channelHash);
            set({ encryptionKeyPair: keyPair, encryptionStatus: "handshaking" });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Key derivation failed";
            set({ encryptionStatus: "error", errorMessage: message });
        }
    },

    addPeerPublicKey: (address: string, publicKey: JsonWebKey) => {
        set((state) => ({
            peerPublicKeys: { ...state.peerPublicKeys, [address.toLowerCase()]: publicKey },
        }));
    },

    removePeerPublicKey: (address: string) => {
        set((state) => {
            const next = { ...state.peerPublicKeys };
            delete next[address.toLowerCase()];
            return { peerPublicKeys: next };
        });
    },

    // ─── 1:1 Double Ratchet ───

    initiateDirectSession: async (peerAddress: string) => {
        const { encryptionKeyPair } = get();
        if (!encryptionKeyPair) return null;

        set({ encryptionMode: "direct" });

        const { initMessage, ephemeralKeyPair } = await createX3DHInitMessage(
            encryptionKeyPair,
            peerAddress
        );

        set({ pendingX3DHEphemeralKeyPair: ephemeralKeyPair });
        return initMessage;
    },

    respondToDirectSession: async (initMessage: X3DHInitMessage, myAddress: string) => {
        const { encryptionKeyPair } = get();
        if (!encryptionKeyPair) return null;

        set({ encryptionMode: "direct" });

        const { responseMessage, rootKey, ephemeralKeyPair } = await respondToX3DH(
            initMessage,
            encryptionKeyPair,
            myAddress
        );

        // Initialize Double Ratchet as responder
        const ephemeralPublicKey = await exportPublicKey(ephemeralKeyPair.publicKey);
        const drState = await initializeDoubleRatchet(
            rootKey,
            false, // responder
            initMessage.ephemeralPublicKey
        );

        // Update DH key pair with our ephemeral
        set({
            doubleRatchetState: {
                ...drState,
                dhKeyPair: { publicKey: ephemeralPublicKey, privateKey: ephemeralKeyPair.privateKey },
            },
            encryptionStatus: "ready",
        });

        return responseMessage;
    },

    completeDirectSession: async (response: X3DHResponseMessage) => {
        const { encryptionKeyPair, pendingX3DHEphemeralKeyPair } = get();
        if (!encryptionKeyPair || !pendingX3DHEphemeralKeyPair) return;

        const { rootKey } = await completeX3DH(
            response,
            encryptionKeyPair,
            pendingX3DHEphemeralKeyPair
        );

        // Initialize Double Ratchet as initiator
        const drState = await initializeDoubleRatchet(
            rootKey,
            true, // initiator
            response.ephemeralPublicKey
        );

        set({
            doubleRatchetState: drState,
            pendingX3DHEphemeralKeyPair: null,
            encryptionStatus: "ready",
        });
    },

    // ─── Group Sender Keys ───

    initializeGroupSenderKey: async (myAddress: string) => {
        const { encryptionKeyPair, peerPublicKeys } = get();
        if (!encryptionKeyPair) {
            throw new Error("No encryption key pair. Call deriveKeyPair first.");
        }

        set({ encryptionMode: "group" });

        const senderKey = await createSenderKeyState(myAddress);

        // Encrypt sender key for each peer
        const encryptedKeys: EncryptedSenderKey[] = [];
        for (const [, peerPublicKey] of Object.entries(peerPublicKeys)) {
            const encrypted = await encryptSenderKeyForPeer(
                senderKey.chainKey,
                encryptionKeyPair.privateKey,
                peerPublicKey,
                myAddress
            );
            encryptedKeys.push(encrypted);
        }

        set({ mySenderKeyState: senderKey, encryptionStatus: "ready" });
        return { senderKey, encryptedKeys };
    },

    handleReceivedSenderKey: async (
        encrypted: EncryptedSenderKey,
        peerPublicKey: JsonWebKey
    ) => {
        const { encryptionKeyPair } = get();
        if (!encryptionKeyPair) return;

        const chainKey = await decryptSenderKeyFromPeer(
            encrypted,
            encryptionKeyPair.privateKey,
            peerPublicKey
        );

        const senderKeyState: SenderKeyState = {
            senderAddress: encrypted.fromAddress,
            chainKey,
            chainIndex: 0,
            skippedMessageKeys: new Map(),
        };

        set((state) => ({
            peerSenderKeys: {
                ...state.peerSenderKeys,
                [encrypted.fromAddress.toLowerCase()]: senderKeyState,
            },
            encryptionStatus: "ready",
        }));
    },

    // ─── Encrypt / Decrypt ───

    encryptOutgoing: async (plaintext: string, senderAddress: string) => {
        const { encryptionMode, doubleRatchetState, mySenderKeyState } = get();

        if (encryptionMode === "direct" && doubleRatchetState) {
            const { message, nextState } = await encryptWithDoubleRatchet(
                doubleRatchetState,
                plaintext,
                senderAddress
            );
            set({ doubleRatchetState: nextState });
            return message;
        }

        if (encryptionMode === "group" && mySenderKeyState) {
            const { encrypted, nextState } = await encryptWithSenderKey(
                mySenderKeyState,
                plaintext
            );
            set({ mySenderKeyState: nextState });
            return encrypted;
        }

        return null;
    },

    decryptIncoming: async (data: Record<string, unknown>) => {
        const { encryptionMode, doubleRatchetState, peerSenderKeys } = get();

        try {
            if (encryptionMode === "direct" && doubleRatchetState) {
                const message = data as unknown as DoubleRatchetMessage;
                const { plaintext, nextState } = await decryptWithDoubleRatchet(
                    doubleRatchetState,
                    message
                );
                set({ doubleRatchetState: nextState });
                return plaintext;
            }

            if (encryptionMode === "group") {
                const encrypted = data as unknown as EncryptedMessage;
                const senderAddress = encrypted.senderAddress.toLowerCase();
                const senderState = peerSenderKeys[senderAddress];
                if (!senderState) {
                    console.warn(`No sender key for ${senderAddress}`);
                    return null;
                }

                const { plaintext, nextState } = await decryptWithSenderKey(
                    senderState,
                    encrypted
                );
                set((state) => ({
                    peerSenderKeys: {
                        ...state.peerSenderKeys,
                        [senderAddress]: nextState,
                    },
                }));
                return plaintext;
            }
        } catch (error) {
            console.error("Decryption failed:", error);
        }

        return null;
    },

    rekeyOnMemberLeave: async (leftAddress: string, myAddress: string) => {
        const { encryptionKeyPair, peerPublicKeys } = get();
        if (!encryptionKeyPair) return [];

        // Remove the departed member
        const nextPeerKeys = { ...peerPublicKeys };
        delete nextPeerKeys[leftAddress.toLowerCase()];
        const nextPeerSenderKeys = { ...get().peerSenderKeys };
        delete nextPeerSenderKeys[leftAddress.toLowerCase()];

        // Generate new sender key
        const newSenderKey = await createSenderKeyState(myAddress);

        // Distribute to remaining peers
        const encryptedKeys: EncryptedSenderKey[] = [];
        for (const [, peerPublicKey] of Object.entries(nextPeerKeys)) {
            const encrypted = await encryptSenderKeyForPeer(
                newSenderKey.chainKey,
                encryptionKeyPair.privateKey,
                peerPublicKey,
                myAddress
            );
            encryptedKeys.push(encrypted);
        }

        set({
            peerPublicKeys: nextPeerKeys,
            peerSenderKeys: nextPeerSenderKeys,
            mySenderKeyState: newSenderKey,
        });

        return encryptedKeys;
    },

    reset: () => {
        set(INITIAL_STATE);
    },
}));
