/**
 * Shared types for the E2E encryption module.
 * Used by both Double Ratchet (1:1) and Sender Keys (group) protocols.
 */

// ─── Key Types ───

export interface EncryptionKeyPair {
    publicKey: JsonWebKey;
    privateKey: CryptoKey;
}

// ─── Sender Keys (Group) ───

export interface SenderKeyState {
    senderAddress: string;
    chainKey: CryptoKey;
    chainIndex: number;
    skippedMessageKeys: Map<number, CryptoKey>;
}

// ─── Double Ratchet (1:1) ───

export interface DoubleRatchetState {
    /** Our current ephemeral DH key pair */
    dhKeyPair: EncryptionKeyPair;
    /** Peer's last ephemeral public key */
    remoteDhPublicKey: JsonWebKey | null;
    /** Current root key for DH ratchet */
    rootKey: CryptoKey;

    /** Sending chain */
    sendingChainKey: CryptoKey | null;
    sendingChainIndex: number;

    /** Receiving chain */
    receivingChainKey: CryptoKey | null;
    receivingChainIndex: number;

    /** Skipped message keys: "pubKeyThumbprint:index" → CryptoKey */
    skippedMessageKeys: Map<string, CryptoKey>;
}

// ─── Wire Formats ───

export interface EncryptedMessage {
    senderAddress: string;
    chainIndex: number;
    ciphertext: string;
    iv: string;
}

export interface DoubleRatchetMessage {
    senderAddress: string;
    senderDhPublicKey: JsonWebKey;
    previousChainLength: number;
    chainIndex: number;
    ciphertext: string;
    iv: string;
}

export interface EncryptedSenderKey {
    encryptedChainKey: string;
    iv: string;
    fromAddress: string;
    forPublicKey: JsonWebKey;
}

// ─── X3DH Handshake ───

export interface X3DHInitMessage {
    identityPublicKey: JsonWebKey;
    ephemeralPublicKey: JsonWebKey;
    fromAddress: string;
}

export interface X3DHResponseMessage {
    identityPublicKey: JsonWebKey;
    ephemeralPublicKey: JsonWebKey;
    fromAddress: string;
}
