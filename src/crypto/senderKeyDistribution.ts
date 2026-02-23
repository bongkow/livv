/**
 * Sender Key distribution — encrypted exchange of chain keys between peers.
 *
 * When a member joins a group room, they need to:
 * 1. Send their ChainKey₀ to every existing member (encrypted with ECDH)
 * 2. Receive every existing member's current chain key (encrypted with ECDH)
 *
 * Transport happens over WebSocket — server sees only encrypted blobs.
 */

import { deriveSharedSecret } from "./deriveSharedSecret";
import { aesGcmEncrypt, aesGcmDecrypt, arrayBufferToBase64, base64ToArrayBuffer } from "./aesGcm";
import { exportChainKey, importChainKey } from "./symmetricRatchet";
import type { EncryptedSenderKey } from "./types";

/**
 * Encrypt our sender key chain key for a specific peer using ECDH.
 */
export async function encryptSenderKeyForPeer(
    chainKey: CryptoKey,
    myPrivateKey: CryptoKey,
    peerPublicKey: JsonWebKey,
    myAddress: string
): Promise<EncryptedSenderKey> {
    // Derive shared secret with peer
    const sharedSecret = await deriveSharedSecret(myPrivateKey, peerPublicKey);

    // Export chain key to raw bytes
    const chainKeyRaw = await exportChainKey(chainKey);
    const chainKeyBase64 = arrayBufferToBase64(chainKeyRaw);

    // Encrypt the chain key with the shared secret
    const { ciphertext, iv } = await aesGcmEncrypt(sharedSecret, chainKeyBase64);

    return {
        encryptedChainKey: ciphertext,
        iv,
        fromAddress: myAddress,
        forPublicKey: peerPublicKey,
    };
}

/**
 * Decrypt a sender key received from a peer.
 */
export async function decryptSenderKeyFromPeer(
    encrypted: EncryptedSenderKey,
    myPrivateKey: CryptoKey,
    peerPublicKey: JsonWebKey
): Promise<CryptoKey> {
    // Derive the same shared secret
    const sharedSecret = await deriveSharedSecret(myPrivateKey, peerPublicKey);

    // Decrypt the chain key
    const chainKeyBase64 = await aesGcmDecrypt(
        sharedSecret,
        encrypted.encryptedChainKey,
        encrypted.iv
    );

    // Import as chain key
    const chainKeyRaw = base64ToArrayBuffer(chainKeyBase64);
    return await importChainKey(chainKeyRaw);
}
