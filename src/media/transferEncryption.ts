/**
 * Per-transfer AES-256-GCM encryption.
 *
 * Each file transfer generates a random AES key.  The key is shared
 * with peers inside the encrypted `file_transfer_start` message
 * (which goes through the existing ratchet / sender-key encryption).
 * Individual chunks are then encrypted directly with this key,
 * avoiding the overhead of advancing the ratchet for every chunk.
 */

import { arrayBufferToBase64, base64ToArrayBuffer } from "@/crypto/aesGcm";

const IV_BYTES = 12;

// ─── Key lifecycle ───

/** Generate a fresh random AES-256-GCM key for one transfer. */
export async function generateTransferKey(): Promise<CryptoKey> {
    return crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true, // extractable — we need to export it for the metadata message
        ["encrypt", "decrypt"],
    );
}

/** Export a transfer key to a base64 string (for inclusion in metadata). */
export async function exportTransferKey(key: CryptoKey): Promise<string> {
    const raw = await crypto.subtle.exportKey("raw", key);
    return arrayBufferToBase64(raw);
}

/** Import a transfer key from a base64 string. */
export async function importTransferKey(base64: string): Promise<CryptoKey> {
    const raw = base64ToArrayBuffer(base64);
    return crypto.subtle.importKey(
        "raw",
        raw,
        { name: "AES-GCM", length: 256 },
        false, // non-extractable once imported on receiver side
        ["encrypt", "decrypt"],
    );
}

// ─── Chunk encryption ───

/** Encrypt a base64-encoded chunk with the transfer key. */
export async function encryptChunk(
    key: CryptoKey,
    base64Data: string,
): Promise<{ ciphertext: string; iv: string }> {
    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const encoded = new TextEncoder().encode(base64Data);

    const ciphertextBuf = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        encoded,
    );

    return {
        ciphertext: arrayBufferToBase64(ciphertextBuf),
        iv: arrayBufferToBase64(iv.buffer),
    };
}

/** Decrypt a chunk back to its base64-encoded data. */
export async function decryptChunk(
    key: CryptoKey,
    ciphertext: string,
    iv: string,
): Promise<string> {
    const ciphertextBuf = base64ToArrayBuffer(ciphertext);
    const ivBuf = base64ToArrayBuffer(iv);

    const plainBuf = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: ivBuf },
        key,
        ciphertextBuf,
    );

    return new TextDecoder().decode(plainBuf);
}
