import { create } from "zustand";
import { appConfig } from "@/config/appConfig";
import { useChatStore } from "./useChatStore";
import { useEncryptionStore } from "./useEncryptionStore";

type ConnectionStatus = "disconnected" | "connecting" | "connected";

interface WebSocketState {
    connectionStatus: ConnectionStatus;
    socket: WebSocket | null;
    reconnectAttempts: number;
}

interface WebSocketActions {
    connect: (jwt: string, channel: string) => void;
    disconnect: () => void;
    sendMessage: (action: string, payload: Record<string, unknown>) => void;
}

type WebSocketStore = WebSocketState & WebSocketActions;

const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_RECONNECT_DELAY_MS = 1000;

export const useWebSocketStore = create<WebSocketStore>()((set, get) => ({
    connectionStatus: "disconnected",
    socket: null,
    reconnectAttempts: 0,

    connect: (jwt: string, channel: string) => {
        const existing = get().socket;
        if (existing && existing.readyState === WebSocket.OPEN) return;

        set({ connectionStatus: "connecting" });

        const wsUrl = `${appConfig.websocketUrl}?token=${jwt}&channel=${encodeURIComponent(channel)}`;
        const socket = new WebSocket(wsUrl);

        socket.onopen = () => {
            set({ connectionStatus: "connected", socket, reconnectAttempts: 0 });
        };

        socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                handleIncomingMessage(data);
            } catch {
                console.warn("Non-JSON WebSocket message:", event.data);
            }
        };

        socket.onclose = () => {
            set({ connectionStatus: "disconnected", socket: null });

            // Auto-reconnect with exponential backoff
            const attempts = get().reconnectAttempts;
            if (attempts < MAX_RECONNECT_ATTEMPTS) {
                const delay = BASE_RECONNECT_DELAY_MS * Math.pow(2, attempts);
                set({ reconnectAttempts: attempts + 1 });
                setTimeout(() => {
                    get().connect(jwt, channel);
                }, delay);
            }
        };

        socket.onerror = () => {
            // onclose will fire after onerror, handling cleanup
        };

        set({ socket });
    },

    disconnect: () => {
        const { socket } = get();
        if (socket) {
            socket.close();
        }
        set({
            connectionStatus: "disconnected",
            socket: null,
            reconnectAttempts: MAX_RECONNECT_ATTEMPTS, // prevent auto-reconnect
        });
    },

    sendMessage: (action: string, payload: Record<string, unknown>) => {
        const { socket, connectionStatus } = get();
        if (socket && connectionStatus === "connected") {
            const msg = JSON.stringify({ action, ...payload });
            console.log("[WS outgoing]", msg);
            socket.send(msg);
        } else {
            console.warn("[WS send failed] status:", connectionStatus, "socket:", !!socket);
        }
    },
}));

async function handleIncomingMessage(data: Record<string, unknown>) {
    const chatStore = useChatStore.getState();
    const encryptionStore = useEncryptionStore.getState();

    // Handle different message types from the WebSocket API
    console.log("[WS incoming]", JSON.stringify(data));
    switch (data.type) {
        case "chat": {
            // Skip messages from self — they're already added locally
            const { useAuthStore } = await import("./useAuthStore");
            const myAddress = useAuthStore.getState().walletAddress;
            const senderAddress = (data.sender as string) || (data.senderAddress as string) || "";
            if (myAddress && senderAddress.toLowerCase() === myAddress.toLowerCase()) {
                break;
            }

            // If message has ciphertext, try to decrypt
            if (data.ciphertext) {
                const plaintext = await encryptionStore.decryptIncoming(data);
                if (plaintext) {
                    chatStore.addMessage({
                        id: (data.id as string) || crypto.randomUUID(),
                        sender: senderAddress,
                        content: plaintext,
                        timestamp: (data.timestamp as number) || Date.now(),
                        encrypted: true,
                    });
                }
            } else {
                // Plaintext fallback
                chatStore.addMessage({
                    id: (data.id as string) || crypto.randomUUID(),
                    sender: data.sender as string,
                    content: (data.message as string) || (data.content as string),
                    timestamp: (data.timestamp as number) || Date.now(),
                });
            }
            break;
        }

        case "encryption_pubkey":
            encryptionStore.addPeerPublicKey(
                data.sender as string,
                data.publicKey as JsonWebKey
            );
            break;

        case "sender_key":
            await encryptionStore.handleReceivedSenderKey(
                data as unknown as import("@/crypto/types").EncryptedSenderKey,
                encryptionStore.peerPublicKeys[(data.sender as string || data.fromAddress as string).toLowerCase()]
            );
            break;

        case "x3dh_init": {
            const response = await encryptionStore.respondToDirectSession(
                data as unknown as import("@/crypto/types").X3DHInitMessage,
                chatStore.currentRoom?.channel || ""
            );
            if (response) {
                const wsStore = useWebSocketStore.getState();
                wsStore.sendMessage("sendmessage", {
                    type: "x3dh_response",
                    ...response,
                });
            }
            break;
        }

        case "x3dh_response":
            await encryptionStore.completeDirectSession(
                data as unknown as import("@/crypto/types").X3DHResponseMessage
            );
            break;

        case "user_joined":
            chatStore.addOnlineUser(data.address as string);
            break;

        case "user_left":
            chatStore.removeOnlineUser(data.address as string);
            break;

        case "peers":
            chatStore.setOnlineUsers(data.peers as string[]);
            break;

        default:
            // If no type, treat as a chat message if it has content
            if (data.message || data.content) {
                chatStore.addMessage({
                    id: (data.id as string) || crypto.randomUUID(),
                    sender: (data.sender as string) || "unknown",
                    content: (data.message as string) || (data.content as string) || "",
                    timestamp: (data.timestamp as number) || Date.now(),
                });
            }
            break;
    }
}
