/*
 * @Module: useGamePresenceStore
 * @Purpose: Zustand store for managing remote player positions in the open world
 * @Logic: Tracks remote players' current and target positions for lerp interpolation.
 *         Updated by WebSocket messages (user_joined, i_am_here, position, user_left).
 * @Interfaces: useGamePresenceStore — addRemotePlayer, removeRemotePlayer, updateRemotePosition
 */

import { create } from "zustand";

export interface RemotePlayer {
    address: string;
    x: number;
    z: number;
    rotY: number;
    targetX: number;
    targetZ: number;
    targetRotY: number;
}

interface GamePresenceState {
    remotePlayers: Map<string, RemotePlayer>;
}

interface GamePresenceActions {
    addRemotePlayer: (address: string, x?: number, z?: number, rotY?: number) => void;
    removeRemotePlayer: (address: string) => void;
    updateRemotePosition: (address: string, x: number, z: number, rotY: number) => void;
    clearAllRemotePlayers: () => void;
}

type GamePresenceStore = GamePresenceState & GamePresenceActions;

export const useGamePresenceStore = create<GamePresenceStore>()((set, get) => ({
    remotePlayers: new Map(),

    addRemotePlayer: (address: string, x = 0, z = 0, rotY = 0) => {
        const players = new Map(get().remotePlayers);
        if (players.has(address.toLowerCase())) return; // already tracked

        players.set(address.toLowerCase(), {
            address,
            x, z, rotY,
            targetX: x,
            targetZ: z,
            targetRotY: rotY,
        });
        set({ remotePlayers: players });
    },

    removeRemotePlayer: (address: string) => {
        const players = new Map(get().remotePlayers);
        players.delete(address.toLowerCase());
        set({ remotePlayers: players });
    },

    updateRemotePosition: (address: string, x: number, z: number, rotY: number) => {
        const players = new Map(get().remotePlayers);
        const existing = players.get(address.toLowerCase());
        if (!existing) return;

        // Snap current to old target, set new target for lerp
        players.set(address.toLowerCase(), {
            ...existing,
            x: existing.targetX,
            z: existing.targetZ,
            rotY: existing.targetRotY,
            targetX: x,
            targetZ: z,
            targetRotY: rotY,
        });
        set({ remotePlayers: players });
    },

    clearAllRemotePlayers: () => {
        set({ remotePlayers: new Map() });
    },
}));
