import { create } from "zustand";

export interface ChatMessage {
    id: string;
    sender: string;
    content: string;
    timestamp: number;
    encrypted?: boolean;
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
    setOnlineUsers: (users: string[]) => void;
    addOnlineUser: (user: string) => void;
    removeOnlineUser: (user: string) => void;
    setCurrentRoom: (room: Room) => void;
    clearMessages: () => void;
}

type ChatStore = ChatState & ChatActions;

export const useChatStore = create<ChatStore>()((set, get) => ({
    messages: [],
    onlineUsers: [],
    currentRoom: null,

    addMessage: (message: ChatMessage) => {
        set((state) => ({ messages: [...state.messages, message] }));
    },

    setOnlineUsers: (users: string[]) => set({ onlineUsers: users }),

    addOnlineUser: (user: string) => {
        const { onlineUsers } = get();
        if (!onlineUsers.includes(user)) {
            set({ onlineUsers: [...onlineUsers, user] });
        }
    },

    removeOnlineUser: (user: string) => {
        set((state) => ({
            onlineUsers: state.onlineUsers.filter((u) => u !== user),
        }));
    },

    setCurrentRoom: (room: Room) => {
        set({ currentRoom: room, messages: [], onlineUsers: [] });
    },

    clearMessages: () => set({ messages: [] }),
}));
