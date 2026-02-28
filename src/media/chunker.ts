/**
 * File chunking and reassembly utilities.
 *
 * Splits an ArrayBuffer into fixed-size base64 chunks and
 * reassembles them back into an ArrayBuffer.
 */

import { CHUNK_SIZE } from "./types";

// ─── Splitting ───

/** Split raw bytes into base64-encoded chunks of `CHUNK_SIZE` bytes each. */
export function splitIntoChunks(buffer: ArrayBuffer): string[] {
    const bytes = new Uint8Array(buffer);
    const chunks: string[] = [];

    for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
        const slice = bytes.slice(offset, offset + CHUNK_SIZE);
        chunks.push(uint8ToBase64(slice));
    }

    return chunks;
}

/** Total number of chunks a file of `byteLength` will produce. */
export function chunkCount(byteLength: number): number {
    return Math.ceil(byteLength / CHUNK_SIZE);
}

// ─── Reassembly ───

/** Reassemble ordered base64 chunks back into an ArrayBuffer. */
export function reassembleChunks(
    chunks: Map<number, string>,
    totalChunks: number,
): ArrayBuffer {
    const parts: Uint8Array[] = [];

    for (let i = 0; i < totalChunks; i++) {
        const b64 = chunks.get(i);
        if (!b64) throw new Error(`Missing chunk ${i}/${totalChunks}`);
        parts.push(base64ToUint8(b64));
    }

    const totalLength = parts.reduce((sum, p) => sum + p.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const part of parts) {
        result.set(part, offset);
        offset += part.length;
    }

    return result.buffer;
}

// ─── Base64 helpers ───

function uint8ToBase64(bytes: Uint8Array): string {
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function base64ToUint8(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}
