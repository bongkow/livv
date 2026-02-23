/**
 * Symmetric KDF chain ratchet (HMAC-SHA256).
 *
 * Used by both Double Ratchet (1:1) and Sender Keys (group).
 * Each ratchet step produces:
 *   - nextChainKey  = HMAC-SHA256(chainKey, 0x01)
 *   - messageKey    = HMAC-SHA256(chainKey, 0x02)
 *
 * After each step, the old chainKey is deleted (forward secrecy).
 */

const CHAIN_KEY_CONSTANT = new Uint8Array([0x01]);
const MESSAGE_KEY_CONSTANT = new Uint8Array([0x02]);

/**
 * Perform one ratchet step on a chain key.
 * Returns the next chain key and a message key for encrypting/decrypting.
 * The caller MUST discard the input chainKey after this call.
 */
export async function ratchetStep(chainKey: CryptoKey): Promise<{
    nextChainKey: CryptoKey;
    messageKey: CryptoKey;
}> {
    const nextChainKey = await hmacDeriveKey(chainKey, CHAIN_KEY_CONSTANT, "HMAC");
    const messageKeyRaw = await hmacDeriveKey(chainKey, MESSAGE_KEY_CONSTANT, "AES-GCM");
    return { nextChainKey, messageKey: messageKeyRaw };
}

/**
 * Ratchet a chain key forward by N steps, collecting any skipped message keys.
 * Used when messages arrive out of order.
 */
export async function ratchetToIndex(
    chainKey: CryptoKey,
    currentIndex: number,
    targetIndex: number,
    maxSkip: number = 100
): Promise<{
    chainKey: CryptoKey;
    messageKey: CryptoKey;
    skippedKeys: Map<number, CryptoKey>;
}> {
    const stepsToSkip = targetIndex - currentIndex;
    if (stepsToSkip < 0) {
        throw new Error(`Cannot ratchet backward: current=${currentIndex}, target=${targetIndex}`);
    }
    if (stepsToSkip > maxSkip) {
        throw new Error(`Too many skipped messages: ${stepsToSkip} > maxSkip=${maxSkip}`);
    }

    const skippedKeys = new Map<number, CryptoKey>();
    let currentKey = chainKey;

    for (let i = currentIndex; i < targetIndex; i++) {
        const { nextChainKey, messageKey } = await ratchetStep(currentKey);
        skippedKeys.set(i, messageKey);
        currentKey = nextChainKey;
    }

    // Final step for the target index
    const { nextChainKey, messageKey } = await ratchetStep(currentKey);

    return {
        chainKey: nextChainKey,
        messageKey,
        skippedKeys,
    };
}

/**
 * Create a fresh chain key from random bytes.
 * Used when initializing a new sender key or resetting after a member leaves.
 */
export async function createRandomChainKey(): Promise<CryptoKey> {
    return await crypto.subtle.generateKey(
        { name: "HMAC", hash: "SHA-256", length: 256 },
        true,
        ["sign"]
    );
}

/**
 * Export a chain key to raw bytes for encrypted distribution.
 */
export async function exportChainKey(chainKey: CryptoKey): Promise<ArrayBuffer> {
    return await crypto.subtle.exportKey("raw", chainKey);
}

/**
 * Import raw bytes as a chain key.
 */
export async function importChainKey(raw: ArrayBuffer): Promise<CryptoKey> {
    return await crypto.subtle.importKey(
        "raw",
        raw,
        { name: "HMAC", hash: "SHA-256" },
        true,
        ["sign"]
    );
}

/** ─── Internal Helpers ─── */

/**
 * HMAC-based key derivation. Signs the constant with the chain key,
 * then imports the result as the desired key type.
 */
async function hmacDeriveKey(
    chainKey: CryptoKey,
    constant: Uint8Array,
    outputType: "HMAC" | "AES-GCM"
): Promise<CryptoKey> {
    const derived = await crypto.subtle.sign("HMAC", chainKey, constant.buffer as ArrayBuffer);

    if (outputType === "HMAC") {
        return await crypto.subtle.importKey(
            "raw",
            derived,
            { name: "HMAC", hash: "SHA-256" },
            true,
            ["sign"]
        );
    }

    // AES-GCM key for message encryption
    return await crypto.subtle.importKey(
        "raw",
        derived,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );
}
