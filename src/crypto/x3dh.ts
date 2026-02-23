/**
 * X3DH (Extended Triple Diffie-Hellman) key agreement for 1:1 chats.
 *
 * Establishes a shared root key between two parties using three ECDH exchanges:
 *   DH1 = ECDH(identityKey_A, ephemeralKey_B)
 *   DH2 = ECDH(ephemeralKey_A, identityKey_B)
 *   DH3 = ECDH(ephemeralKey_A, ephemeralKey_B)
 *   rootKey = HKDF(DH1 || DH2 || DH3)
 *
 * This root key is then used to initialize the Double Ratchet.
 */

import { generateEphemeralKeyPair, exportPublicKey } from "./deriveSharedSecret";
import type { EncryptionKeyPair, X3DHInitMessage, X3DHResponseMessage } from "./types";

/**
 * Initiator side: create the X3DH init message and compute the shared root key
 * once we receive the responder's reply.
 */
export async function createX3DHInitMessage(
    identityKeyPair: EncryptionKeyPair,
    myAddress: string
): Promise<{
    initMessage: X3DHInitMessage;
    ephemeralKeyPair: CryptoKeyPair;
}> {
    const ephemeralKeyPair = await generateEphemeralKeyPair();
    const ephemeralPublicKey = await exportPublicKey(ephemeralKeyPair.publicKey);

    const initMessage: X3DHInitMessage = {
        identityPublicKey: identityKeyPair.publicKey,
        ephemeralPublicKey,
        fromAddress: myAddress,
    };

    return { initMessage, ephemeralKeyPair };
}

/**
 * Responder side: receive init, create response, and compute root key.
 */
export async function respondToX3DH(
    initMessage: X3DHInitMessage,
    myIdentityKeyPair: EncryptionKeyPair,
    myAddress: string
): Promise<{
    responseMessage: X3DHResponseMessage;
    rootKey: CryptoKey;
    ephemeralKeyPair: CryptoKeyPair;
}> {
    const ephemeralKeyPair = await generateEphemeralKeyPair();
    const ephemeralPublicKey = await exportPublicKey(ephemeralKeyPair.publicKey);

    // Compute the 3 DH exchanges (responder side)
    const rootKey = await computeX3DHRootKey(
        myIdentityKeyPair.privateKey,
        ephemeralKeyPair.privateKey,
        initMessage.identityPublicKey,
        initMessage.ephemeralPublicKey,
        false // responder
    );

    const responseMessage: X3DHResponseMessage = {
        identityPublicKey: myIdentityKeyPair.publicKey,
        ephemeralPublicKey,
        fromAddress: myAddress,
    };

    return { responseMessage, rootKey, ephemeralKeyPair };
}

/**
 * Initiator side: complete the X3DH by computing root key from the response.
 */
export async function completeX3DH(
    responseMessage: X3DHResponseMessage,
    myIdentityKeyPair: EncryptionKeyPair,
    myEphemeralKeyPair: CryptoKeyPair
): Promise<{ rootKey: CryptoKey }> {
    const rootKey = await computeX3DHRootKey(
        myIdentityKeyPair.privateKey,
        myEphemeralKeyPair.privateKey,
        responseMessage.identityPublicKey,
        responseMessage.ephemeralPublicKey,
        true // initiator
    );

    return { rootKey };
}

/**
 * Compute the X3DH root key from 3 DH exchanges.
 *
 * Initiator computes:
 *   DH1 = ECDH(myEphemeral,  theirIdentity)
 *   DH2 = ECDH(myIdentity,   theirEphemeral)
 *   DH3 = ECDH(myEphemeral,  theirEphemeral)
 *
 * Responder computes:
 *   DH1 = ECDH(myIdentity,   theirEphemeral)
 *   DH2 = ECDH(myEphemeral,  theirIdentity)
 *   DH3 = ECDH(myEphemeral,  theirEphemeral)
 *
 * Both produce the same DH outputs (just in different order), so we sort consistently.
 */
async function computeX3DHRootKey(
    myIdentityPrivate: CryptoKey,
    myEphemeralPrivate: CryptoKey,
    theirIdentityPublicJwk: JsonWebKey,
    theirEphemeralPublicJwk: JsonWebKey,
    isInitiator: boolean
): Promise<CryptoKey> {
    const theirIdentityPublic = await importEcdhPublicKey(theirIdentityPublicJwk);
    const theirEphemeralPublic = await importEcdhPublicKey(theirEphemeralPublicJwk);

    let dh1: ArrayBuffer;
    let dh2: ArrayBuffer;
    let dh3: ArrayBuffer;

    if (isInitiator) {
        dh1 = await ecdhDeriveBits(myEphemeralPrivate, theirIdentityPublic);
        dh2 = await ecdhDeriveBits(myIdentityPrivate, theirEphemeralPublic);
        dh3 = await ecdhDeriveBits(myEphemeralPrivate, theirEphemeralPublic);
    } else {
        dh1 = await ecdhDeriveBits(myIdentityPrivate, theirEphemeralPublic);
        dh2 = await ecdhDeriveBits(myEphemeralPrivate, theirIdentityPublic);
        dh3 = await ecdhDeriveBits(myEphemeralPrivate, theirEphemeralPublic);
    }

    // Concatenate: DH1 || DH2 || DH3
    const combined = concatArrayBuffers(dh1, dh2, dh3);

    // Derive root key via HKDF
    const hkdfKey = await crypto.subtle.importKey("raw", combined, "HKDF", false, [
        "deriveKey",
    ]);

    return await crypto.subtle.deriveKey(
        {
            name: "HKDF",
            hash: "SHA-256",
            salt: new TextEncoder().encode("livv-x3dh"),
            info: new TextEncoder().encode("root-key"),
        },
        hkdfKey,
        { name: "HMAC", hash: "SHA-256", length: 256 },
        true,
        ["sign"]
    );
}

/** ─── Helpers ─── */

async function importEcdhPublicKey(jwk: JsonWebKey): Promise<CryptoKey> {
    return await crypto.subtle.importKey(
        "jwk",
        jwk,
        { name: "ECDH", namedCurve: "P-256" },
        false,
        []
    );
}

async function ecdhDeriveBits(
    privateKey: CryptoKey,
    publicKey: CryptoKey
): Promise<ArrayBuffer> {
    return await crypto.subtle.deriveBits(
        { name: "ECDH", public: publicKey },
        privateKey,
        256
    );
}

function concatArrayBuffers(...buffers: ArrayBuffer[]): ArrayBuffer {
    const totalLength = buffers.reduce((sum, buf) => sum + buf.byteLength, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const buf of buffers) {
        result.set(new Uint8Array(buf), offset);
        offset += buf.byteLength;
    }
    return result.buffer;
}
