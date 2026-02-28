/**
 * Image transfer — validation, preparation, and send orchestration.
 *
 * Handles image-specific concerns (MIME type allowlist, size limit)
 * and delegates chunking / encryption to the shared utilities.
 */

import { splitIntoChunks } from "./chunker";
import {
    SUPPORTED_IMAGE_TYPES,
    MAX_IMAGE_SIZE,
    type FileTransferMeta,
} from "./types";
import {
    generateTransferKey,
    exportTransferKey,
    encryptChunk,
} from "./transferEncryption";
import { generateThumbnail } from "./thumbnail";

// ─── Validation ───

/** Returns an error string if the file is invalid, or `null` if OK. */
export function validateImageFile(file: File): string | null {
    if (!SUPPORTED_IMAGE_TYPES.includes(file.type as typeof SUPPORTED_IMAGE_TYPES[number])) {
        return `Unsupported image type: ${file.type}. Supported: JPEG, PNG, GIF, WebP.`;
    }
    if (file.size > MAX_IMAGE_SIZE) {
        return `Image too large (${formatMB(file.size)}). Maximum: ${formatMB(MAX_IMAGE_SIZE)}.`;
    }
    return null;
}

// ─── Preparation ───

export interface PreparedImageTransfer {
    meta: FileTransferMeta;
    transferKey: CryptoKey;
    encryptedChunks: { ciphertext: string; iv: string }[];
}

/**
 * Read the image file, generate a transfer key, split into chunks,
 * and encrypt every chunk.  Returns everything needed to send.
 */
export async function prepareImageTransfer(
    file: File,
    sender: string,
    onChunkReady?: (index: number, total: number) => void,
): Promise<PreparedImageTransfer> {
    const error = validateImageFile(file);
    if (error) throw new Error(error);

    // Generate thumbnail for instant receiver preview (non-blocking on failure)
    let thumbnail: string | undefined;
    try {
        thumbnail = await generateThumbnail(file);
    } catch (err) {
        console.warn("[image-transfer] Thumbnail generation failed, skipping:", err);
    }

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
        mediaType: "image",
        transferKey: transferKeyB64,
        thumbnail,
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
