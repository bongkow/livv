"use client";

import { useState, useRef, useCallback } from "react";

interface MessageInputProps {
    onSend: (text: string) => void;
    disabled?: boolean;
}

export default function MessageInput({ onSend, disabled }: MessageInputProps) {
    const [text, setText] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    const handleSend = useCallback(() => {
        if (!text.trim() || disabled) return;
        onSend(text.trim());
        setText("");
        inputRef.current?.focus();
    }, [text, disabled, onSend]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
            }
        },
        [handleSend]
    );

    return (
        <div className="border-t border-white/[0.08] px-4 py-3">
            <div className="flex items-center gap-3">
                <input
                    ref={inputRef}
                    type="text"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={disabled}
                    placeholder={disabled ? "Connecting..." : "Message..."}
                    className="flex-1 bg-transparent border-b border-white/[0.1] py-2 text-sm text-white placeholder-white/20 outline-none focus:border-white/30 transition-colors disabled:opacity-30"
                />
                <button
                    onClick={handleSend}
                    disabled={!text.trim() || disabled}
                    className="text-sm text-white/40 hover:text-white transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
                >
                    Send
                </button>
            </div>
        </div>
    );
}
