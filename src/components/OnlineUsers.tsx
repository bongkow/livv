import { useChatStore } from "@/stores/useChatStore";
import { truncateAddress } from "@/utils/truncateAddress";

export default function OnlineUsers() {
    const onlineUsers = useChatStore((s) => s.onlineUsers);

    return (
        <div className="flex flex-col border-l border-white/[0.08] w-48">
            <div className="border-b border-white/[0.08] px-4 py-3">
                <p className="text-[11px] text-white/30 uppercase tracking-widest">
                    Online · {onlineUsers.length}
                </p>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1">
                {onlineUsers.length === 0 && (
                    <p className="text-xs text-white/15 py-2">—</p>
                )}
                {onlineUsers.map((address) => (
                    <p
                        key={address}
                        className="text-xs text-white/40 font-mono py-0.5"
                    >
                        {truncateAddress(address)}
                    </p>
                ))}
            </div>
        </div>
    );
}
