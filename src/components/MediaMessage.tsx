"use client";

import type { MediaAttachment } from "@/media/types";

interface MediaMessageProps {
    media: MediaAttachment;
}

export default function MediaMessage({ media }: MediaMessageProps) {
    const { mediaType, status, progress, objectUrl, fileName, fileSize } = media;

    return (
        <div className="MediaMessage flex flex-col gap-1.5 max-w-xs">
            {/* Preview area */}
            <div className="relative rounded overflow-hidden bg-white/[0.04] border border-white/[0.08]">
                {objectUrl ? (
                    mediaType === "image" ? (
                        <img
                            src={objectUrl}
                            alt={fileName}
                            className="block max-w-full max-h-64 object-contain"
                        />
                    ) : (
                        <video
                            src={objectUrl}
                            controls
                            preload="metadata"
                            className="block max-w-full max-h-64"
                        />
                    )
                ) : (
                    /* Placeholder while receiving */
                    <div className="flex items-center justify-center h-32 w-full">
                        <PlaceholderIcon mediaType={mediaType} />
                    </div>
                )}

                {/* Progress overlay — visible while sending/receiving */}
                {(status === "sending" || status === "receiving") && (
                    <div className="absolute inset-x-0 bottom-0 bg-black/60 px-2 py-1">
                        <div className="flex items-center gap-2">
                            <div className="flex-1 h-1 rounded-full bg-white/20 overflow-hidden">
                                <div
                                    className="h-full bg-white/80 transition-all duration-150"
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                            <span className="text-[10px] text-white/60 tabular-nums">
                                {progress}%
                            </span>
                        </div>
                    </div>
                )}

                {/* Error overlay */}
                {status === "error" && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                        <span className="text-xs text-red-400/80">Transfer failed</span>
                    </div>
                )}
            </div>

            {/* File info */}
            <div className="flex items-center gap-2 text-[10px] text-white/30">
                <span className="truncate">{fileName}</span>
                <span className="shrink-0">{formatFileSize(fileSize)}</span>
            </div>
        </div>
    );
}

// ─── Sub-components ───

function PlaceholderIcon({ mediaType }: { mediaType: "image" | "video" }) {
    if (mediaType === "image") {
        return (
            <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-white/15"
            >
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
            </svg>
        );
    }

    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-white/15"
        >
            <polygon points="23 7 16 12 23 17 23 7" />
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
        </svg>
    );
}

// ─── Helpers ───

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
