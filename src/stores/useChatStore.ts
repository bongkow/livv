import { create } from "zustand";
import type { MediaAttachment } from "@/media/types";

export interface ChatMessage {
    id: string;
    sender: string;
    content: string;
    timestamp: number;
    encrypted?: boolean;
    /** Present when this message represents a media (image/video) transfer. */
    media?: MediaAttachment;
}

export type RoomType = "1:1" | "group";

/** Derive room type from capacity: >2 peers = group, otherwise 1:1 */
export function deriveRoomType(maxPeersPerRoom: number): RoomType {
    return maxPeersPerRoom > 2 ? "group" : "1:1";
}

export interface Room {
    name: string;
    channel: string;
    maxPeersPerRoom: number;
}

interface ChatState {
    messages: ChatMessage[];
    onlineUsers: string[];
    currentRoom: Room | null;
}

interface ChatActions {
    addMessage: (message: ChatMessage) => void;
    /** Patch the `media` field of the message whose media.transferId matches. */
    updateMessageMedia: (transferId: string, updates: Partial<MediaAttachment>) => void;
    setOnlineUsers: (users: string[]) => void;
    addOnlineUser: (user: string) => void;
    removeOnlineUser: (user: string) => void;
    setCurrentRoom: (room: Room) => void;
    clearMessages: () => void;
    clearRoom: () => void;
}

type ChatStore = ChatState & ChatActions;

export const useChatStore = create<ChatStore>()((set, get) => ({
    messages: [],
    onlineUsers: [],
    currentRoom: null,

    addMessage: (message: ChatMessage) => {
        set((state) => {
            const idx = state.messages.findIndex((m) => m.id === message.id);
            if (idx >= 0) {
                // Upsert: merge into existing message, preserving fields like objectUrl
                const existing = state.messages[idx];
                const merged: ChatMessage = {
                    ...existing,
                    ...message,
                    media: existing.media
                        ? { ...existing.media, ...message.media }
                        : message.media,
                };
                const next = [...state.messages];
                next[idx] = merged;
                return { messages: next };
            }
            return { messages: [...state.messages, message] };
        });
    },

    updateMessageMedia: (transferId: string, updates: Partial<MediaAttachment>) => {
        set((state) => ({
            messages: state.messages.map((msg) =>
                msg.media?.transferId === transferId
                    ? { ...msg, media: { ...msg.media, ...updates } }
                    : msg
            ),
        }));
    },

    setOnlineUsers: (users: string[]) => set({ onlineUsers: users }),

    addOnlineUser: (user: string) => {
        const { onlineUsers } = get();
        const normalized = user.toLowerCase();
        if (!onlineUsers.some((u) => u.toLowerCase() === normalized)) {
            set({ onlineUsers: [...onlineUsers, user] });
        }
    },

    removeOnlineUser: (user: string) => {
        const normalized = user.toLowerCase();
        set((state) => ({
            onlineUsers: state.onlineUsers.filter(
                (u) => u.toLowerCase() !== normalized
            ),
        }));
    },

    setCurrentRoom: (room: Room) => {
        set({ currentRoom: room, messages: [], onlineUsers: [] });
    },

    clearMessages: () => set({ messages: [] }),

    clearRoom: () => set({ currentRoom: null, messages: [], onlineUsers: [] }),
}));
