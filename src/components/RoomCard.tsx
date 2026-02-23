"use client";

import type { RoomData } from "@/app/actions/fetchRoom";
import { truncateAddress } from "@/utils/truncateAddress";

interface RoomCardProps {
    room: RoomData;
    isSignedIn: boolean;
    onEnter: (roomName: string, roomType: string) => void;
}

export default function RoomCard({ room, isSignedIn, onEnter }: RoomCardProps) {
    const typeLabel = room.roomType || "1:1";

    return (
        <div className="flex flex-col justify-between border border-white/[0.08] p-5 gap-4">
            <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium text-white">
                        {room.roomName}
                    </h3>
                    <span className="text-[10px] text-white/20 border border-white/[0.08] px-1.5 py-0.5">
                        {typeLabel}
                    </span>
                </div>
                <span className="text-[11px] text-white/25">
                    led by {truncateAddress(room.leader)}
                </span>
            </div>

            {isSignedIn ? (
                <button
                    onClick={() => onEnter(room.roomName, room.roomType || "1:1")}
                    className="w-full border border-white/20 py-2 text-xs text-white/60 transition-colors"
                >
                    enter
                </button>
            ) : (
                <span className="text-center text-[11px] text-white/15 py-2">
                    sign in to enter
                </span>
            )}
        </div>
    );
}
