"use client";

import { useRef, useCallback } from "react";
import { SUPPORTED_IMAGE_TYPES, SUPPORTED_VIDEO_TYPES } from "@/media/types";

interface MediaAttachmentButtonProps {
    onFileSelected: (file: File) => void;
    disabled?: boolean;
}

const ACCEPT = [
    ...SUPPORTED_IMAGE_TYPES,
    ...SUPPORTED_VIDEO_TYPES,
].join(",");

export default function MediaAttachmentButton({
    onFileSelected,
    disabled,
}: MediaAttachmentButtonProps) {
    const inputRef = useRef<HTMLInputElement>(null);

    const handleClick = useCallback(() => {
        inputRef.current?.click();
    }, []);

    const handleChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (file) {
                onFileSelected(file);
                // Reset so the same file can be re-selected
                e.target.value = "";
            }
        },
        [onFileSelected],
    );

    return (
        <>
            <input
                ref={inputRef}
                type="file"
                accept={ACCEPT}
                onChange={handleChange}
                className="hidden"
                tabIndex={-1}
            />
            <button
                type="button"
                onClick={handleClick}
                disabled={disabled}
                title="Attach image or video"
                className="border border-white/20 p-2 text-white/40 transition-colors hover:text-white/80 hover:border-white/40 disabled:opacity-20 disabled:cursor-not-allowed rounded"
            >
                {/* Paperclip icon (SVG) */}
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
                </svg>
            </button>
        </>
    );
}
