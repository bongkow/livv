"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import MessageList from "./MessageList";
import MessageInput from "./MessageInput";
import PeersInRoom from "./PeersInRoom";
import { useChatConnection } from "@/hooks/useChatConnection";
import { useChatStore, deriveRoomType } from "@/stores/useChatStore";

interface ChatRoomProps {
    roomName: string;
}

export default function ChatRoom({ roomName }: ChatRoomProps) {
    const { connectionStatus, encryptionStatus, isEncryptionReady, isRoomFull, sendChatMessage, exitRoom } =
        useChatConnection(roomName);
    const currentRoom = useChatStore((s) => s.currentRoom);
    const router = useRouter();

    const handleExitRoom = () => {
        exitRoom();
        router.push("/");
    };

    // Gate: show preparation screen until everything is ready
    if (encryptionStatus === "idle" || encryptionStatus === "deriving" || encryptionStatus === "error") {
        return (
            <PreparationGate
                roomName={roomName}
                connectionStatus={connectionStatus}
                encryptionStatus={encryptionStatus}
                hasRoom={!!currentRoom}
            />
        );
    }

    // Gate: block entry when room is at capacity
    if (isRoomFull) {
        return (
            <RoomFullGate
                roomName={roomName}
                maxPeersPerRoom={currentRoom?.maxPeersPerRoom ?? 2}
            />
        );
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
                        <span className="text-[11px] text-white/20">{deriveRoomType(currentRoom?.maxPeersPerRoom ?? 2)}</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <EncryptionBadge status={encryptionStatus} />
                        <StatusDot status={connectionStatus} />
                        <button
                            onClick={handleExitRoom}
                            className="border border-white/15 px-3 py-1 text-[11px] text-white/40 transition-colors hover:text-white/80 hover:border-white/40"
                        >
                            exit
                        </button>
                    </div>
                </div>

                <MessageList />

                <MessageInput
                    onSend={sendChatMessage}
                    disabled={isInputDisabled}
                />
            </div>

            {/* Sidebar — hidden on mobile */}
            <div className="PeersInRoom hidden lg:block">
                <PeersInRoom />
            </div>
        </div>
    );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function PreparationGate({
    roomName,
    connectionStatus,
    encryptionStatus,
    hasRoom,
}: {
    roomName: string;
    connectionStatus: "disconnected" | "connecting" | "connected";
    encryptionStatus: "idle" | "deriving" | "handshaking" | "ready" | "error";
    hasRoom: boolean;
}) {
    const steps = [
        { label: "Fetching room", done: hasRoom },
        { label: "Deriving encryption keys", done: encryptionStatus !== "idle" && encryptionStatus !== "deriving" },
        { label: "Connecting to server", done: connectionStatus === "connected" },
        { label: "Key exchange", done: encryptionStatus === "ready" },
    ];

    // Find the currently active step (first not-done)
    const activeIndex = steps.findIndex((s) => !s.done);

    return (
        <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-6 text-center max-w-sm">
                <span className="text-2xl">
                    {encryptionStatus === "error" ? "🔓" : "🔐"}
                </span>
                <h2 className="text-sm font-medium text-white/70">
                    # {roomName}
                </h2>

                {encryptionStatus === "error" ? (
                    <p className="text-xs text-red-400/60">
                        Encryption setup failed. Please refresh and try again.
                    </p>
                ) : (
                    <div className="flex flex-col gap-2 w-full">
                        {steps.map((step, i) => (
                            <div key={step.label} className="flex items-center gap-2.5">
                                <StepIndicator done={step.done} active={i === activeIndex} />
                                <span className={`text-xs ${step.done
                                    ? "text-white/50"
                                    : i === activeIndex
                                        ? "text-white/70 animate-pulse"
                                        : "text-white/20"
                                    }`}>
                                    {step.label}
                                    {i === activeIndex && "…"}
                                </span>
                            </div>
                        ))}
                    </div>
                )}

                {encryptionStatus === "deriving" && (
                    <p className="text-[11px] text-white/25 mt-1">
                        Sign the message in your wallet
                    </p>
                )}
            </div>
        </div>
    );
}

function StepIndicator({ done, active }: { done: boolean; active: boolean }) {
    if (done) {
        return <span className="text-[10px] text-white/50 w-3 text-center">✓</span>;
    }
    if (active) {
        return <span className="w-3 h-3 border border-white/40 rounded-full animate-spin border-t-transparent" />;
    }
    return <span className="w-1.5 h-1.5 rounded-full bg-white/15 ml-[3px]" />;
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

function RoomFullGate({
    roomName,
    maxPeersPerRoom,
}: {
    roomName: string;
    maxPeersPerRoom: number;
}) {
    return (
        <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-4 text-center max-w-sm">
                <span className="text-2xl">🚫</span>
                <h2 className="text-sm font-medium text-white/70">
                    # {roomName}
                </h2>
                <p className="text-xs text-white/40">
                    This room is full ({maxPeersPerRoom}/{maxPeersPerRoom})
                </p>
                <Link
                    href="/"
                    className="border border-white/20 px-4 py-2 text-xs text-white/60 transition-colors hover:text-white/80 hover:border-white/40"
                >
                    ← back to rooms
                </Link>
            </div>
        </div>
    );
}
