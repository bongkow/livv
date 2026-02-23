import MessageList from "./MessageList";
import MessageInput from "./MessageInput";
import OnlineUsers from "./OnlineUsers";
import { useChatConnection } from "@/hooks/useChatConnection";
import { useChatStore } from "@/stores/useChatStore";

interface ChatRoomProps {
    roomName: string;
}

export default function ChatRoom({ roomName }: ChatRoomProps) {
    const { connectionStatus, sendChatMessage } = useChatConnection(roomName, "public");
    const currentRoom = useChatStore((s) => s.currentRoom);

    return (
        <div className="flex h-full border border-white/[0.08]">
            {/* Main chat */}
            <div className="flex flex-1 flex-col min-w-0">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
                    <div className="flex items-center gap-3">
                        <span className="text-sm font-medium">
                            # {currentRoom?.name || roomName}
                        </span>
                        <span className="text-[11px] text-white/20">public</span>
                    </div>
                    <StatusDot status={connectionStatus} />
                </div>

                <MessageList />

                <MessageInput
                    onSend={sendChatMessage}
                    disabled={connectionStatus !== "connected"}
                />
            </div>

            {/* Sidebar — hidden on mobile */}
            <div className="hidden lg:block">
                <OnlineUsers />
            </div>
        </div>
    );
}

function StatusDot({ status }: { status: "disconnected" | "connecting" | "connected" }) {
    const color = {
        connected: "bg-white",
        connecting: "bg-white/40 animate-pulse",
        disconnected: "bg-white/15",
    }[status];

    return (
        <div className="flex items-center gap-1.5">
            <div className={`h-1.5 w-1.5 rounded-full ${color}`} />
            <span className="text-[11px] text-white/25">{status}</span>
        </div>
    );
}
