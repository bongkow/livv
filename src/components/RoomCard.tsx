/*
 * @Module: RoomCard
 * @Purpose: Renders a single chat room as a card with enter action
 * @Logic: Displays room name, type badge, peer count, leader address. Shows enter button when signed in.
 * @Interfaces: default export RoomCard, RoomCardProps
 * @Constraints: No internal state — fully controlled via props
 */
"use client";

import type { RoomData } from "@/app/actions/fetchRoom";
import { deriveRoomType } from "@/stores/useChatStore";
import { truncateAddress } from "@/utils/truncateAddress";
import FaceAvatar from "./FaceAvatar";

interface RoomCardProps {
    room: RoomData;
    isSignedIn: boolean;
    onEnter: (roomName: string) => void;
}

export default function RoomCard({ room, isSignedIn, onEnter }: RoomCardProps) {
    const typeLabel = deriveRoomType(room.maxPeersPerRoom ?? 2);

    return (
        <div className="RoomCard flex flex-col justify-between border border-white/[0.08] rounded-lg p-5 gap-4 transition-colors duration-200 hover:bg-white/[0.03]">
            <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium text-white">
                        {room.roomName}
                    </h3>
                    <span className="text-[10px] text-white/20 border border-white/[0.12] rounded-sm px-1.5 py-0.5">
                        {typeLabel}
                    </span>
                    <span className="text-[10px] text-white/30 font-mono">
                        0/{room.maxPeersPerRoom ?? 2}
                    </span>
                </div>
                <span className="text-[11px] text-white/25 inline-flex items-center gap-1">
                    led by <FaceAvatar address={room.leader} size={12} /> {truncateAddress(room.leader)}
                </span>
            </div>

            {isSignedIn ? (
                <button
                    onClick={() => onEnter(room.roomName)}
                    className="w-full border border-white/20 rounded py-2 text-xs text-white/60 transition-all duration-200 hover:bg-white/10 hover:text-white/80"
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
