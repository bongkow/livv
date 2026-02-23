/**
 * ECDH shared secret derivation.
 *
 * Computes a shared secret between two ECDH P-256 keys using the
 * Diffie-Hellman key agreement protocol. Returns an AES-256-GCM CryptoKey
 * that can be used for symmetric encryption.
 *
 * Used for:
 * - Encrypting sender keys during distribution (group)
 * - X3DH shared secret computation (1:1)
 * - DH ratchet steps (1:1)
 */

const ECDH_CURVE = "P-256";

/**
 * Derive an AES-256-GCM key from ECDH key agreement.
 * ECDH(myPrivateKey, theirPublicKey) → shared AES key
 */
export async function deriveSharedSecret(
    myPrivateKey: CryptoKey,
    theirPublicKeyJwk: JsonWebKey
): Promise<CryptoKey> {
    // Import the peer's public key from JWK
    const theirPublicKey = await crypto.subtle.importKey(
        "jwk",
        theirPublicKeyJwk,
        { name: "ECDH", namedCurve: ECDH_CURVE },
        false,
        []
    );

    // Derive raw shared bits via ECDH
    const sharedBits = await crypto.subtle.deriveBits(
        { name: "ECDH", public: theirPublicKey },
        myPrivateKey,
        256
    );

    // Import the raw shared bits as an HKDF key for further derivation
    const hkdfKey = await crypto.subtle.importKey("raw", sharedBits, "HKDF", false, [
        "deriveKey",
    ]);

    // Derive an AES-256-GCM key from the shared bits using HKDF
    const aesKey = await crypto.subtle.deriveKey(
        {
            name: "HKDF",
            hash: "SHA-256",
            salt: new TextEncoder().encode("livv-e2e-shared"),
            info: new TextEncoder().encode("aes-256-gcm"),
        },
        hkdfKey,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );

    return aesKey;
}

/**
 * Generate a fresh ECDH P-256 key pair.
 * Used for ephemeral keys in DH ratchet steps and X3DH handshakes.
 */
export async function generateEphemeralKeyPair(): Promise<CryptoKeyPair> {
    return await crypto.subtle.generateKey(
        { name: "ECDH", namedCurve: ECDH_CURVE },
        true,
        ["deriveBits"]
    );
}

/**
 * Export a CryptoKey (public) to JWK format for sharing over WebSocket.
 */
export async function exportPublicKey(key: CryptoKey): Promise<JsonWebKey> {
    const jwk = await crypto.subtle.exportKey("jwk", key);
    // Strip private components for safety
    return {
        kty: jwk.kty,
        crv: jwk.crv,
        x: jwk.x,
        y: jwk.y,
        key_ops: [],
        ext: true,
    };
}

/**
 * Import a JWK public key as a CryptoKey for ECDH operations.
 */
export async function importPublicKey(jwk: JsonWebKey): Promise<CryptoKey> {
    return await crypto.subtle.importKey(
        "jwk",
        jwk,
        { name: "ECDH", namedCurve: ECDH_CURVE },
        true,
        []
    );
}
