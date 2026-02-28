"use client";

import { useState, useRef, useCallback } from "react";
import MediaAttachmentButton from "./MediaAttachmentButton";

interface MessageInputProps {
    onSend: (text: string) => void;
    onFileSelected: (file: File) => void;
    disabled?: boolean;
}

export default function MessageInput({ onSend, onFileSelected, disabled }: MessageInputProps) {
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
        <div className="MessageInput border-t border-white/[0.08] px-4 py-3">
            <div className="flex items-center gap-3">
                <MediaAttachmentButton
                    onFileSelected={onFileSelected}
                    disabled={disabled}
                />
                <input
                    ref={inputRef}
                    type="text"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={disabled}
                    placeholder={disabled ? "Connecting..." : "Message..."}
                    className="MessageInputInput flex-1 bg-transparent border border-white py-2 px-3 text-sm text-white placeholder-white/40 outline-none focus:border-white transition-colors disabled:opacity-30 rounded"
                />
                <button
                    onClick={handleSend}
                    disabled={!text.trim() || disabled}
                    className="MessageInputButton border border-white py-2 px-3 text-sm text-white hover:bg-white hover:text-black transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
                >
                    Send
                </button>
            </div>
        </div>
    );
}
