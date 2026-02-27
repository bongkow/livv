"use client";

import { useRef, useEffect } from "react";
import { useChatStore, type ChatMessage } from "@/stores/useChatStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { truncateAddress } from "@/utils/truncateAddress";
import MediaMessage from "./MediaMessage";

export default function MessageList() {
    const messages = useChatStore((s) => s.messages);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [messages]);

    return (
        <div ref={scrollRef} className="MessageList flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {messages.length === 0 && (
                <div className="flex h-full items-center justify-center">
                    <p className="text-white/20 text-sm">No messages yet</p>
                </div>
            )}
            {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
            ))}
        </div>
    );
}

function MessageBubble({ message }: { message: ChatMessage }) {
    const walletAddress = useAuthStore((s) => s.walletAddress);
    const isSelf = message.sender.toLowerCase() === walletAddress.toLowerCase();

    const time = new Date(message.timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
    });

    return (
        <div className={`flex ${isSelf ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[70%] ${isSelf ? "text-right" : "text-left"}`}>
                {!isSelf && (
                    <p className="text-[11px] text-white/30 font-mono mb-0.5">
                        {truncateAddress(message.sender)}
                    </p>
                )}
                {message.media ? (
                    <MediaMessage media={message.media} />
                ) : (
                    <div
                        className={`inline-block px-3 py-2 text-sm leading-relaxed break-words ${isSelf
                            ? "bg-white text-black"
                            : "bg-white/[0.06] text-white/80 border border-white/[0.08]"
                            }`}
                    >
                        {message.content}
                    </div>
                )}
                <p className="text-[10px] text-white/20 mt-0.5">{time}</p>
            </div>
        </div>
    );
}
