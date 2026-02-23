/**
 * AES-256-GCM encrypt/decrypt primitives.
 *
 * Shared by both Double Ratchet (1:1) and Sender Keys (group).
 * Each call generates a fresh random 12-byte IV.
 */

const IV_LENGTH_BYTES = 12;

/**
 * Encrypt plaintext with AES-256-GCM.
 * Returns base64-encoded ciphertext and IV.
 */
export async function aesGcmEncrypt(
    key: CryptoKey,
    plaintext: string
): Promise<{ ciphertext: string; iv: string }> {
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH_BYTES));
    const encoded = new TextEncoder().encode(plaintext);

    const ciphertextBuffer = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        encoded
    );

    return {
        ciphertext: arrayBufferToBase64(ciphertextBuffer),
        iv: arrayBufferToBase64(iv.buffer),
    };
}

/**
 * Decrypt AES-256-GCM ciphertext.
 * Expects base64-encoded ciphertext and IV.
 */
export async function aesGcmDecrypt(
    key: CryptoKey,
    ciphertext: string,
    iv: string
): Promise<string> {
    const ciphertextBuffer = base64ToArrayBuffer(ciphertext);
    const ivBuffer = base64ToArrayBuffer(iv);

    const plaintextBuffer = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: ivBuffer },
        key,
        ciphertextBuffer
    );

    return new TextDecoder().decode(plaintextBuffer);
}

/** ─── Base64 Helpers ─── */

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary);
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}
