/**
 * File transfer state management — Zustand store.
 *
 * Tracks every in-flight (sending / receiving) file transfer,
 * orchestrates the send pipeline (prepare → metadata → chunks → complete),
 * and handles incoming chunks from peers.
 */

import { create } from "zustand";
import type { ChatMessage } from "./useChatStore";
import type {
    FileTransfer,
    FileTransferMeta,
    MediaAttachment,
} from "@/media/types";
import { reassembleChunks } from "@/media/chunker";
import { importTransferKey, decryptChunk } from "@/media/transferEncryption";
import { prepareImageTransfer } from "@/media/imageTransfer";
import { prepareVideoTransfer } from "@/media/videoTransfer";
import { SUPPORTED_IMAGE_TYPES, SUPPORTED_VIDEO_TYPES } from "@/media/types";

// ─── Store shape ───

interface FileTransferState {
    transfers: Record<string, FileTransfer>;
}

interface FileTransferActions {
    /** High-level: validate, chunk, encrypt, and send a file over the WebSocket. */
    sendFile: (
        file: File,
        senderAddress: string,
        sendWsMessage: (action: string, payload: Record<string, unknown>) => void,
        encryptOutgoing: ((plaintext: string, senderAddress: string) => Promise<Record<string, unknown> | null>) | null,
        addChatMessage: (msg: ChatMessage) => void,
    ) => Promise<void>;

    /** Handle an incoming `file_transfer_start` message (metadata). */
    handleTransferStart: (
        meta: FileTransferMeta,
        senderAddress: string,
        addChatMessage: (msg: ChatMessage) => void,
    ) => Promise<void>;

    /** Handle an incoming `file_transfer_chunk` message. */
    handleTransferChunk: (
        transferId: string,
        chunkIndex: number,
        ciphertext: string,
        iv: string,
        updateMessageMedia: (transferId: string, updates: Partial<MediaAttachment>) => void,
    ) => Promise<void>;

    /** Handle an incoming `file_transfer_complete` message. */
    handleTransferComplete: (
        transferId: string,
        updateMessageMedia: (transferId: string, updates: Partial<MediaAttachment>) => void,
    ) => Promise<void>;

    /** Remove a transfer and revoke its blob URL. */
    removeTransfer: (transferId: string) => void;

    /** Clean up all transfers. */
    cleanup: () => void;
}

type FileTransferStore = FileTransferState & FileTransferActions;

// ─── Store ───

export const useFileTransferStore = create<FileTransferStore>()((set, get) => ({
    transfers: {},

    // ─── Sending ───

    sendFile: async (file, senderAddress, sendWsMessage, encryptOutgoing, addChatMessage) => {
        const mediaType = resolveMediaType(file.type);
        if (!mediaType) {
            console.warn("[file-transfer] Unsupported file type:", file.type);
            return;
        }

        try {
            // 1. Prepare (validate + chunk + encrypt chunks)
            const prepared = mediaType === "image"
                ? await prepareImageTransfer(file, senderAddress)
                : await prepareVideoTransfer(file, senderAddress);

            const { meta, transferKey, encryptedChunks } = prepared;

            // 2. Track locally
            set((s) => ({
                transfers: {
                    ...s.transfers,
                    [meta.transferId]: {
                        meta,
                        chunks: new Map(),
                        receivedCount: 0,
                        status: "sending",
                        progress: 0,
                        transferKey,
                    },
                },
            }));

            // 3. Add optimistic chat message
            const objectUrl = URL.createObjectURL(file);
            addChatMessage({
                id: meta.transferId,
                sender: senderAddress,
                content: `[${mediaType === "image" ? "Image" : "Video"}] ${meta.fileName}`,
                timestamp: Date.now(),
                encrypted: !!encryptOutgoing,
                media: {
                    transferId: meta.transferId,
                    fileName: meta.fileName,
                    fileSize: meta.fileSize,
                    mimeType: meta.mimeType,
                    mediaType: meta.mediaType,
                    status: "sending",
                    progress: 0,
                    objectUrl,
                } satisfies MediaAttachment,
            });

            // 4. Send metadata (encrypted via ratchet if available)
            const metaPayload = JSON.stringify(meta);
            if (encryptOutgoing) {
                const encrypted = await encryptOutgoing(metaPayload, senderAddress);
                if (encrypted) {
                    sendWsMessage("broadcastToChannel", {
                        ...encrypted,
                        sender: senderAddress,
                        type: "file_transfer_start",
                    });
                }
            } else {
                // Plaintext fallback
                sendWsMessage("broadcastToChannel", {
                    ...meta,
                    sender: senderAddress,
                    type: "file_transfer_start",
                });
            }

            // 5. Send chunks sequentially
            for (let i = 0; i < encryptedChunks.length; i++) {
                sendWsMessage("broadcastToChannel", {
                    type: "file_transfer_chunk",
                    transferId: meta.transferId,
                    chunkIndex: i,
                    ciphertext: encryptedChunks[i].ciphertext,
                    iv: encryptedChunks[i].iv,
                    sender: senderAddress,
                });

                // Update local progress
                const progress = Math.round(((i + 1) / encryptedChunks.length) * 100);
                updateTransferProgress(set, meta.transferId, progress);
            }

            // 6. Send completion signal
            sendWsMessage("broadcastToChannel", {
                type: "file_transfer_complete",
                transferId: meta.transferId,
                sender: senderAddress,
            });

            // 7. Mark complete
            set((s) => {
                const t = s.transfers[meta.transferId];
                if (!t) return s;
                return {
                    transfers: {
                        ...s.transfers,
                        [meta.transferId]: { ...t, status: "complete", progress: 100 },
                    },
                };
            });
        } catch (err) {
            console.error("[file-transfer] Send failed:", err);
        }
    },

    // ─── Receiving ───

    handleTransferStart: async (meta, senderAddress, addChatMessage) => {
        try {
            const transferKey = await importTransferKey(meta.transferKey);

            set((s) => ({
                transfers: {
                    ...s.transfers,
                    [meta.transferId]: {
                        meta,
                        chunks: new Map(),
                        receivedCount: 0,
                        status: "receiving",
                        progress: 0,
                        transferKey,
                    },
                },
            }));

            // Add placeholder chat message
            addChatMessage({
                id: meta.transferId,
                sender: senderAddress,
                content: `[${meta.mediaType === "image" ? "Image" : "Video"}] ${meta.fileName}`,
                timestamp: Date.now(),
                encrypted: true,
                media: {
                    transferId: meta.transferId,
                    fileName: meta.fileName,
                    fileSize: meta.fileSize,
                    mimeType: meta.mimeType,
                    mediaType: meta.mediaType,
                    status: "receiving",
                    progress: 0,
                } satisfies MediaAttachment,
            });
        } catch (err) {
            console.error("[file-transfer] Failed to handle transfer start:", err);
        }
    },

    handleTransferChunk: async (transferId, chunkIndex, ciphertext, iv, updateMessageMedia) => {
        const transfer = get().transfers[transferId];
        if (!transfer || !transfer.transferKey) return;

        try {
            const decrypted = await decryptChunk(transfer.transferKey, ciphertext, iv);
            const newChunks = new Map(transfer.chunks);
            newChunks.set(chunkIndex, decrypted);

            const receivedCount = newChunks.size;
            const progress = Math.round((receivedCount / transfer.meta.totalChunks) * 100);

            set((s) => ({
                transfers: {
                    ...s.transfers,
                    [transferId]: {
                        ...transfer,
                        chunks: newChunks,
                        receivedCount,
                        progress,
                    },
                },
            }));

            updateMessageMedia(transferId, { progress });
        } catch (err) {
            console.error(`[file-transfer] Chunk ${chunkIndex} decrypt failed:`, err);
        }
    },

    handleTransferComplete: async (transferId, updateMessageMedia) => {
        const transfer = get().transfers[transferId];
        if (!transfer) return;

        try {
            // Reassemble all chunks into a blob
            const buffer = reassembleChunks(transfer.chunks, transfer.meta.totalChunks);
            const blob = new Blob([buffer], { type: transfer.meta.mimeType });
            const objectUrl = URL.createObjectURL(blob);

            set((s) => ({
                transfers: {
                    ...s.transfers,
                    [transferId]: {
                        ...transfer,
                        status: "complete",
                        progress: 100,
                        objectUrl,
                    },
                },
            }));

            updateMessageMedia(transferId, {
                status: "complete",
                progress: 100,
                objectUrl,
            });
        } catch (err) {
            console.error("[file-transfer] Reassembly failed:", err);

            set((s) => ({
                transfers: {
                    ...s.transfers,
                    [transferId]: { ...transfer, status: "error", errorMessage: String(err) },
                },
            }));

            updateMessageMedia(transferId, { status: "error" });
        }
    },

    removeTransfer: (transferId) => {
        const transfer = get().transfers[transferId];
        if (transfer?.objectUrl) {
            URL.revokeObjectURL(transfer.objectUrl);
        }
        set((s) => {
            const next = { ...s.transfers };
            delete next[transferId];
            return { transfers: next };
        });
    },

    cleanup: () => {
        const { transfers } = get();
        for (const t of Object.values(transfers)) {
            if (t.objectUrl) URL.revokeObjectURL(t.objectUrl);
        }
        set({ transfers: {} });
    },
}));

// ─── Helpers ───

function resolveMediaType(mimeType: string): "image" | "video" | null {
    if ((SUPPORTED_IMAGE_TYPES as readonly string[]).includes(mimeType)) return "image";
    if ((SUPPORTED_VIDEO_TYPES as readonly string[]).includes(mimeType)) return "video";
    return null;
}

function updateTransferProgress(
    set: (fn: (s: FileTransferState) => Partial<FileTransferState>) => void,
    transferId: string,
    progress: number,
) {
    set((s) => {
        const t = s.transfers[transferId];
        if (!t) return s;
        return {
            transfers: {
                ...s.transfers,
                [transferId]: { ...t, progress },
            },
        };
    });
}
