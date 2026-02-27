/**
 * Video transfer — validation, preparation, and send orchestration.
 *
 * Handles video-specific concerns (MIME type allowlist, size limit)
 * and delegates chunking / encryption to the shared utilities.
 */

import { splitIntoChunks } from "./chunker";
import {
    SUPPORTED_VIDEO_TYPES,
    MAX_VIDEO_SIZE,
    type FileTransferMeta,
} from "./types";
import {
    generateTransferKey,
    exportTransferKey,
    encryptChunk,
} from "./transferEncryption";

// ─── Validation ───

/** Returns an error string if the file is invalid, or `null` if OK. */
export function validateVideoFile(file: File): string | null {
    if (!SUPPORTED_VIDEO_TYPES.includes(file.type as typeof SUPPORTED_VIDEO_TYPES[number])) {
        return `Unsupported video type: ${file.type}. Supported: MP4, WebM, QuickTime.`;
    }
    if (file.size > MAX_VIDEO_SIZE) {
        return `Video too large (${formatMB(file.size)}). Maximum: ${formatMB(MAX_VIDEO_SIZE)}.`;
    }
    return null;
}

// ─── Preparation ───

export interface PreparedVideoTransfer {
    meta: FileTransferMeta;
    transferKey: CryptoKey;
    encryptedChunks: { ciphertext: string; iv: string }[];
}

/**
 * Read the video file, generate a transfer key, split into chunks,
 * and encrypt every chunk.  Returns everything needed to send.
 */
export async function prepareVideoTransfer(
    file: File,
    sender: string,
    onChunkReady?: (index: number, total: number) => void,
): Promise<PreparedVideoTransfer> {
    const error = validateVideoFile(file);
    if (error) throw new Error(error);

    const buffer = await file.arrayBuffer();
    const rawChunks = splitIntoChunks(buffer);
    const transferKey = await generateTransferKey();
    const transferKeyB64 = await exportTransferKey(transferKey);

    const meta: FileTransferMeta = {
        transferId: crypto.randomUUID(),
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        totalChunks: rawChunks.length,
        mediaType: "video",
        transferKey: transferKeyB64,
    };

    // Encrypt chunks
    const encryptedChunks: { ciphertext: string; iv: string }[] = [];
    for (let i = 0; i < rawChunks.length; i++) {
        const encrypted = await encryptChunk(transferKey, rawChunks[i]);
        encryptedChunks.push(encrypted);
        onChunkReady?.(i + 1, rawChunks.length);
    }

    return { meta, transferKey, encryptedChunks };
}

// ─── Helpers ───

function formatMB(bytes: number): string {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
