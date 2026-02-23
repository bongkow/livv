/**
 * Barrel exports for the E2E encryption module.
 */

// Types
export type {
    EncryptionKeyPair,
    SenderKeyState,
    DoubleRatchetState,
    EncryptedMessage,
    DoubleRatchetMessage,
    EncryptedSenderKey,
    X3DHInitMessage,
    X3DHResponseMessage,
} from "./types";

// Key generation
export { generateEncryptionKeyPair } from "./generateEncryptionKeyPair";

// ECDH
export {
    deriveSharedSecret,
    generateEphemeralKeyPair,
    exportPublicKey,
    importPublicKey,
} from "./deriveSharedSecret";

// Symmetric ratchet (shared primitive)
export {
    ratchetStep,
    ratchetToIndex,
    createRandomChainKey,
    exportChainKey,
    importChainKey,
} from "./symmetricRatchet";

// AES-GCM (shared primitive)
export {
    aesGcmEncrypt,
    aesGcmDecrypt,
    arrayBufferToBase64,
    base64ToArrayBuffer,
} from "./aesGcm";

// X3DH (1:1)
export {
    createX3DHInitMessage,
    respondToX3DH,
    completeX3DH,
} from "./x3dh";

// Double Ratchet (1:1)
export {
    initializeDoubleRatchet,
    encryptWithDoubleRatchet,
    decryptWithDoubleRatchet,
} from "./doubleRatchet";

// Sender Keys (group)
export {
    createSenderKeyState,
    encryptWithSenderKey,
    decryptWithSenderKey,
} from "./senderKeyRatchet";

// Sender Key distribution (group)
export {
    encryptSenderKeyForPeer,
    decryptSenderKeyFromPeer,
} from "./senderKeyDistribution";
