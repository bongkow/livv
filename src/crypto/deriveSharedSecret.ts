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

/**
 * Validate that a JWK represents a valid ECDH P-256 public key.
 *
 * Checks:
 *   1. Required fields (kty, crv, x, y) are present and well-typed
 *   2. kty === "EC" and crv === "P-256"
 *   3. No private key component (d) is present
 *   4. The point actually lies on the P-256 curve (via Web Crypto importKey)
 */
export async function validatePublicKeyJwk(jwk: unknown): Promise<boolean> {
    if (!jwk || typeof jwk !== "object") return false;

    const key = jwk as Record<string, unknown>;

    // Structural checks
    if (key.kty !== "EC" || key.crv !== "P-256") return false;
    if (typeof key.x !== "string" || typeof key.y !== "string") return false;
    if (key.x.length === 0 || key.y.length === 0) return false;
    if ("d" in key && key.d !== undefined) return false; // reject private keys

    // Cryptographic validation — importKey verifies the point is on the curve
    try {
        await crypto.subtle.importKey(
            "jwk",
            { kty: "EC", crv: "P-256", x: key.x, y: key.y },
            { name: "ECDH", namedCurve: ECDH_CURVE },
            false,
            []
        );
        return true;
    } catch {
        return false;
    }
}
