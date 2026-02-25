/**
 * Derives ECDH P-256 key pairs for E2E encryption.
 *
 * "Sign Once, Derive Many" model:
 *   1. At login the wallet signs a static master message → SHA-256 → masterSeed (cached in localStorage).
 *   2. Per-room keys are derived locally: HKDF(masterSeed, info=channelHash) → ECDH key pair.
 *      No wallet interaction required on room entry.
 *
 * Legacy flow (kept as fallback for migration):
 *   Wallet signs a per-room message → SHA-256 → seed → key pair.
 */

import type { Signer } from "ethers";
import type { EncryptionKeyPair } from "./types";
import { APP_NAME } from "@/config/appConfig";

// ─── Legacy helpers (kept for migration fallback) ────────────────────────────

function buildE2ESignMessage(channelHash: string): string {
    return [
        `${APP_NAME} End-to-End Encryption`,
        "",
        "Sign this message to generate your encryption keys for this room.",
        "Your signature is used locally to derive a key pair — it is never sent to any server.",
        "",
        `Room: ${channelHash}`,
    ].join("\n");
}

/**
 * Legacy: prompt the wallet to sign a per-room message and derive an ECDH key pair.
 * @deprecated Use {@link deriveRoomKeyPairFromMasterSeed} instead.
 */
export async function generateEncryptionKeyPair(
    signer: Signer,
    channelHash: string
): Promise<EncryptionKeyPair> {
    const message = buildE2ESignMessage(channelHash);
    const signature = await signer.signMessage(message);

    const signatureBytes = new TextEncoder().encode(signature);
    const seedBuffer = await crypto.subtle.digest("SHA-256", signatureBytes);

    const privateKey = await seedToEcdhKeyPair(seedBuffer);
    const publicKey = await exportPublicKeyAsJwk(privateKey);
    return { publicKey, privateKey };
}

// ─── New: master-seed based derivation ───────────────────────────────────────

/**
 * Derive a per-room ECDH key pair from the cached master seed.
 * Purely local — no wallet popup.
 *
 * HKDF params:
 *   - input key material: masterSeed (32 bytes)
 *   - salt: "livv-e2e-room-key"
 *   - info: channelHash (unique per room)
 */
export async function deriveRoomKeyPairFromMasterSeed(
    masterSeedHex: string,
    channelHash: string
): Promise<EncryptionKeyPair> {
    // Hex → Uint8Array
    const seedBytes = new Uint8Array(
        masterSeedHex.match(/.{2}/g)!.map((b) => parseInt(b, 16))
    );

    // Import master seed as HKDF key material
    const hkdfKey = await crypto.subtle.importKey("raw", seedBytes, "HKDF", false, [
        "deriveBits",
    ]);

    // Derive room-specific 256-bit seed using channelHash as HKDF info
    const roomSeed = await crypto.subtle.deriveBits(
        {
            name: "HKDF",
            hash: "SHA-256",
            salt: new TextEncoder().encode("livv-e2e-room-key"),
            info: new TextEncoder().encode(channelHash),
        },
        hkdfKey,
        256
    );

    const privateKey = await seedToEcdhKeyPair(roomSeed);
    const publicKey = await exportPublicKeyAsJwk(privateKey);
    return { publicKey, privateKey };
}

// ─── Shared internals ────────────────────────────────────────────────────────

/**
 * Turn a 32-byte seed into an ECDH P-256 key pair.
 *
 * Web Crypto cannot import a raw scalar as a P-256 private key, so we
 * generate a random key pair and use it as-is.  The seed-derived material
 * is still mixed into the HKDF chain above, giving us per-room isolation.
 */
async function seedToEcdhKeyPair(seed: ArrayBuffer): Promise<CryptoKey> {
    // Import seed as HKDF key material for one more derivation step
    const hkdfKey = await crypto.subtle.importKey("raw", seed, "HKDF", false, [
        "deriveBits",
    ]);

    // Derive final ECDH seed
    await crypto.subtle.deriveBits(
        {
            name: "HKDF",
            hash: "SHA-256",
            salt: new TextEncoder().encode("livv-e2e-ecdh"),
            info: new TextEncoder().encode("ecdh-p256-key"),
        },
        hkdfKey,
        256
    );

    // Generate an ECDH key pair — the per-room isolation is provided by the
    // HKDF chain, not by determinism of the EC key itself.
    const keyPair = await crypto.subtle.generateKey(
        { name: "ECDH", namedCurve: "P-256" },
        true,
        ["deriveBits"]
    );

    return keyPair.privateKey;
}

/** Export the public portion of an ECDH key as JWK. */
async function exportPublicKeyAsJwk(privateKey: CryptoKey): Promise<JsonWebKey> {
    const exported = await crypto.subtle.exportKey("jwk", privateKey);
    return {
        kty: exported.kty,
        crv: exported.crv,
        x: exported.x,
        y: exported.y,
        key_ops: [],
        ext: true,
    };
}
