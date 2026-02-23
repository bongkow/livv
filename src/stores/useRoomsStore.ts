import { create } from "zustand";
import { fetchAllRooms } from "@/api/rooms";
import type { RoomData } from "@/api/rooms";

interface RoomsState {
    rooms: RoomData[];
    isLoadingRooms: boolean;
}

interface RoomsActions {
    loadRooms: () => Promise<void>;
}

type RoomsStore = RoomsState & RoomsActions;

export const useRoomsStore = create<RoomsStore>()((set) => ({
    rooms: [],
    isLoadingRooms: false,

    loadRooms: async () => {
        set({ isLoadingRooms: true });
        try {
            const rooms = await fetchAllRooms();
            set({ rooms, isLoadingRooms: false });
        } catch (error) {
            console.error("Failed to load rooms:", error);
            set({ isLoadingRooms: false });
        }
    },
}));
