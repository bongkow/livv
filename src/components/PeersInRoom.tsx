"use client";

import { useChatStore } from "@/stores/useChatStore";
import { truncateAddress } from "@/utils/truncateAddress";
import FaceAvatar from "./FaceAvatar";

/**
 * @Module: PeersInRoom
 * @Purpose: Lists peers currently in the chat room with face avatars
 * @Logic: Reads onlineUsers from store, renders a PresenceBadge per peer
 * @Interfaces: default export PeersInRoom
 * @Constraints: No internal state — fully driven by useChatStore
 */
export default function PeersInRoom() {
    const onlineUsers = useChatStore((s) => s.onlineUsers);
    const maxPeersPerRoom = useChatStore((s) => s.currentRoom?.maxPeersPerRoom ?? 2);

    return (
        <div className="PeersInRoom flex flex-col border-l border-white/[0.08] w-48">
            <div className="border-b border-white/[0.08] px-4 py-3">
                <p className="text-[11px] text-white/30 uppercase tracking-widest">
                    In Room · {onlineUsers.length}/{maxPeersPerRoom}
                </p>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-3">
                {onlineUsers.length === 0 && (
                    <p className="text-xs text-white/15 py-1">—</p>
                )}
                <div className="flex flex-row flex-wrap gap-1.5">
                    {onlineUsers.map((address) => (
                        <PresenceBadge key={address} address={address} />
                    ))}
                </div>
            </div>
        </div>
    );
}

function PresenceBadge({ address }: { address: string }) {
    return (
        <div className="flex items-center gap-1.5 bg-white/[0.04] border border-white/[0.08] rounded-full px-2.5 py-1">
            <FaceAvatar address={address} size={14} />
            <span className="text-[11px] text-white/50 font-mono whitespace-nowrap">
                {truncateAddress(address)}
            </span>
        </div>
    );
}
