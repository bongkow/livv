/**
 * Shared types and constants for chunked media transfer.
 *
 * Files (images / videos) are split into fixed-size chunks and sent
 * over the existing WebSocket relay.  A per-transfer AES-256-GCM key
 * encrypts every chunk so media data stays end-to-end encrypted
 * without burning ratchet state on every chunk.
 */

// ─── Constants ───

/** Raw bytes per chunk — 16 KB stays well under the 32 KB WS frame limit after base64 + JSON overhead. */
export const CHUNK_SIZE = 16 * 1024;

export const SUPPORTED_IMAGE_TYPES = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
] as const;

export const SUPPORTED_VIDEO_TYPES = [
    "video/mp4",
    "video/webm",
    "video/quicktime",
] as const;

export const MAX_IMAGE_SIZE = 10 * 1024 * 1024;  // 10 MB
export const MAX_VIDEO_SIZE = 100 * 1024 * 1024;  // 100 MB

export type MediaType = "image" | "video";

// ─── Wire messages ───

/** Sent once before chunks begin.  Metadata + the transfer AES key (encrypted via ratchet). */
export interface FileTransferMeta {
    transferId: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    totalChunks: number;
    mediaType: MediaType;
    /** Base64-encoded raw AES-256 key — present only inside the encrypted payload. */
    transferKey: string;
    /** Optional base64 data URL thumbnail for instant preview (images only). */
    thumbnail?: string;
}

/** One chunk of the file. Encrypted with the per-transfer AES key. */
export interface FileChunkMessage {
    type: "file_transfer_chunk";
    transferId: string;
    chunkIndex: number;
    /** AES-GCM ciphertext of the base64-encoded raw chunk. */
    ciphertext: string;
    /** AES-GCM IV. */
    iv: string;
    sender: string;
}

/** Signals that the sender has finished transmitting all chunks. */
export interface FileTransferCompleteMessage {
    type: "file_transfer_complete";
    transferId: string;
    sender: string;
}

// ─── In-memory transfer tracking ───

export type TransferStatus = "sending" | "receiving" | "complete" | "error";

export interface FileTransfer {
    meta: FileTransferMeta;
    /** chunkIndex → decrypted base64 chunk data */
    chunks: Map<number, string>;
    receivedCount: number;
    status: TransferStatus;
    progress: number;
    objectUrl?: string;
    transferKey?: CryptoKey;
    errorMessage?: string;
    /** Set when `file_transfer_complete` arrives; reassembly deferred until all chunks decrypted. */
    completionSignaled?: boolean;
}

// ─── ChatMessage media attachment ───

export interface MediaAttachment {
    transferId: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    mediaType: MediaType;
    status: TransferStatus;
    progress: number;
    objectUrl?: string;
    /** Base64 data URL thumbnail for instant preview while receiving. */
    thumbnailUrl?: string;
}
