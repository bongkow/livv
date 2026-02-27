"use client";

import { useEffect } from "react";
import { useRoomsStore } from "@/stores/useRoomsStore";
import RoomCard from "./RoomCard";

interface RoomGridProps {
    isSignedIn: boolean;
    onEnterRoom: (roomName: string) => void;
}

export default function RoomGrid({ isSignedIn, onEnterRoom }: RoomGridProps) {
    const rooms = useRoomsStore((s) => s.rooms);
    const loadRooms = useRoomsStore((s) => s.loadRooms);

    useEffect(() => {
        if (rooms.length === 0) loadRooms();
    }, [rooms.length, loadRooms]);

    return (
        <div className="RoomGrid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px">
            {rooms.map((room) => (
                <RoomCard
                    key={room.roomName}
                    room={room}
                    isSignedIn={isSignedIn}
                    onEnter={onEnterRoom}
                />
            ))}
        </div>
    );
}
