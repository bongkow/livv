"use client";

import MessageList from "./MessageList";
import MessageInput from "./MessageInput";
import OnlineUsers from "./OnlineUsers";
import { useChatConnection } from "@/hooks/useChatConnection";
import { useChatStore } from "@/stores/useChatStore";

import type { RoomType } from "@/stores/useChatStore";

interface ChatRoomProps {
    roomName: string;
    roomType?: RoomType;
}

export default function ChatRoom({ roomName, roomType = "1:1" }: ChatRoomProps) {
    const { connectionStatus, encryptionStatus, isEncryptionReady, sendChatMessage } =
        useChatConnection(roomName, roomType);
    const currentRoom = useChatStore((s) => s.currentRoom);

    // Gate: show signing prompt until keys are derived
    if (encryptionStatus === "idle" || encryptionStatus === "deriving") {
        return <SigningGate status={encryptionStatus} roomName={roomName} />;
    }

    if (encryptionStatus === "error") {
        return <SigningGate status="error" roomName={roomName} />;
    }

    const isInputDisabled = connectionStatus !== "connected" || !isEncryptionReady;


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
                        <span className="text-[11px] text-white/20">{roomType}</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <EncryptionBadge status={encryptionStatus} />
                        <StatusDot status={connectionStatus} />
                    </div>
                </div>

                <MessageList />

                <MessageInput
                    onSend={sendChatMessage}
                    disabled={isInputDisabled}
                />
            </div>

            {/* Sidebar — hidden on mobile */}
            <div className="hidden lg:block">
                <OnlineUsers />
            </div>
        </div>
    );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function SigningGate({
    status,
    roomName,
}: {
    status: "idle" | "deriving" | "error";
    roomName: string;
}) {
    return (
        <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-4 text-center max-w-sm">
                <span className="text-2xl">
                    {status === "error" ? "🔓" : "🔐"}
                </span>
                <h2 className="text-sm font-medium text-white/70">
                    # {roomName}
                </h2>
                {status === "idle" && (
                    <p className="text-xs text-white/30">
                        Preparing encryption…
                    </p>
                )}
                {status === "deriving" && (
                    <>
                        <p className="text-xs text-white/40">
                            Sign the message in your wallet to generate encryption keys for this room.
                        </p>
                        <p className="text-[11px] text-white/20 animate-pulse">
                            Waiting for wallet signature…
                        </p>
                    </>
                )}
                {status === "error" && (
                    <p className="text-xs text-red-400/60">
                        Encryption setup failed. Please refresh and try again.
                    </p>
                )}
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

function EncryptionBadge({
    status,
}: {
    status: "idle" | "deriving" | "handshaking" | "ready" | "error";
}) {
    if (status === "idle") return null;

    const config = {
        deriving: { text: "deriving keys…", style: "text-white/25 animate-pulse" },
        handshaking: { text: "key exchange…", style: "text-white/25 animate-pulse" },
        ready: { text: "🔒 e2e", style: "text-white/40" },
        error: { text: "🔓 unencrypted", style: "text-red-400/60" },
    }[status];

    return <span className={`text-[11px] ${config.style}`}>{config.text}</span>;
}
