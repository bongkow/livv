/**
 * Double Ratchet protocol for 1:1 E2E encrypted chats.
 *
 * Combines:
 * - DH Ratchet: new ECDH exchange on direction changes (post-compromise security)
 * - Symmetric Ratchet: KDF chain per message (forward secrecy)
 *
 * Initialized with a root key from X3DH handshake.
 */

import { generateEphemeralKeyPair, exportPublicKey } from "./deriveSharedSecret";
import { ratchetStep as symmetricRatchetStep } from "./symmetricRatchet";
import { aesGcmEncrypt, aesGcmDecrypt } from "./aesGcm";
import type { DoubleRatchetState, DoubleRatchetMessage, EncryptionKeyPair } from "./types";

const MAX_SKIP = 100;

/**
 * Initialize a Double Ratchet session after X3DH completes.
 *
 * @param rootKey - Shared root key from X3DH
 * @param isInitiator - true if this user initiated the X3DH handshake
 * @param remoteDhPublicKey - Peer's ephemeral public key from X3DH (initiator gets this from response)
 */
export async function initializeDoubleRatchet(
    rootKey: CryptoKey,
    isInitiator: boolean,
    remoteDhPublicKey: JsonWebKey | null
): Promise<DoubleRatchetState> {
    const dhKeyPair = await generateEphemeralKeyPair();
    const publicKey = await exportPublicKey(dhKeyPair.publicKey);

    let sendingChainKey: CryptoKey | null = null;

    // If initiator, perform first DH ratchet step to get sending chain
    if (isInitiator && remoteDhPublicKey) {
        const { sendingChain, newRootKey } = await dhRatchetStep(
            rootKey,
            dhKeyPair.privateKey,
            remoteDhPublicKey
        );
        sendingChainKey = sendingChain;
        rootKey = newRootKey;
    }

    return {
        dhKeyPair: { publicKey, privateKey: dhKeyPair.privateKey },
        remoteDhPublicKey,
        rootKey,
        sendingChainKey,
        sendingChainIndex: 0,
        receivingChainKey: null,
        receivingChainIndex: 0,
        skippedMessageKeys: new Map(),
    };
}

/**
 * Encrypt a message using the Double Ratchet.
 * 
 * Ratchets the sending chain forward and encrypts with the derived message key.
 */
export async function encryptWithDoubleRatchet(
    state: DoubleRatchetState,
    plaintext: string,
    senderAddress: string
): Promise<{
    message: DoubleRatchetMessage;
    nextState: DoubleRatchetState;
}> {
    // If no sending chain, we need a DH ratchet step first
    if (!state.sendingChainKey) {
        throw new Error("No sending chain key. Perform a DH ratchet step first.");
    }

    // Symmetric ratchet step
    const { nextChainKey, messageKey } = await symmetricRatchetStep(state.sendingChainKey);

    // Encrypt
    const { ciphertext, iv } = await aesGcmEncrypt(messageKey, plaintext);

    const message: DoubleRatchetMessage = {
        senderAddress,
        senderDhPublicKey: state.dhKeyPair.publicKey,
        previousChainLength: state.sendingChainIndex,
        chainIndex: state.sendingChainIndex,
        ciphertext,
        iv,
    };

    const nextState: DoubleRatchetState = {
        ...state,
        sendingChainKey: nextChainKey,
        sendingChainIndex: state.sendingChainIndex + 1,
    };

    return { message, nextState };
}

/**
 * Decrypt a message using the Double Ratchet.
 *
 * Handles:
 * 1. Messages from the current receiving chain
 * 2. Messages requiring a new DH ratchet step (new senderDhPublicKey)
 * 3. Out-of-order messages (skipped keys)
 */
export async function decryptWithDoubleRatchet(
    state: DoubleRatchetState,
    message: DoubleRatchetMessage
): Promise<{
    plaintext: string;
    nextState: DoubleRatchetState;
}> {
    // Check if this message's key was already skipped and stored
    const skippedKeyId = makeSkippedKeyId(message.senderDhPublicKey, message.chainIndex);
    const skippedKey = state.skippedMessageKeys.get(skippedKeyId);
    if (skippedKey) {
        const plaintext = await aesGcmDecrypt(skippedKey, message.ciphertext, message.iv);
        const newSkipped = new Map(state.skippedMessageKeys);
        newSkipped.delete(skippedKeyId);
        return {
            plaintext,
            nextState: { ...state, skippedMessageKeys: newSkipped },
        };
    }

    let currentState = { ...state, skippedMessageKeys: new Map(state.skippedMessageKeys) };

    // Check if we need a DH ratchet (new sender DH public key)
    const isNewDhKey =
        !state.remoteDhPublicKey ||
        state.remoteDhPublicKey.x !== message.senderDhPublicKey.x ||
        state.remoteDhPublicKey.y !== message.senderDhPublicKey.y;

    if (isNewDhKey) {
        // Skip any remaining messages from the old receiving chain
        if (currentState.receivingChainKey) {
            currentState = await skipMessageKeys(
                currentState,
                currentState.receivingChainIndex,
                message.previousChainLength
            );
        }

        // DH ratchet step: derive new receiving chain
        const { sendingChain: receivingChain, newRootKey } = await dhRatchetStep(
            currentState.rootKey,
            currentState.dhKeyPair.privateKey,
            message.senderDhPublicKey
        );

        // Generate new DH key pair for our next send
        const newDhKeyPair = await generateEphemeralKeyPair();
        const newPublicKey = await exportPublicKey(newDhKeyPair.publicKey);

        // DH ratchet step for sending chain
        const { sendingChain, newRootKey: finalRootKey } = await dhRatchetStep(
            newRootKey,
            newDhKeyPair.privateKey,
            message.senderDhPublicKey
        );

        currentState = {
            ...currentState,
            dhKeyPair: { publicKey: newPublicKey, privateKey: newDhKeyPair.privateKey },
            remoteDhPublicKey: message.senderDhPublicKey,
            rootKey: finalRootKey,
            receivingChainKey: receivingChain,
            receivingChainIndex: 0,
            sendingChainKey: sendingChain,
            sendingChainIndex: 0,
        };
    }

    // Skip any messages in the current receiving chain
    if (currentState.receivingChainIndex < message.chainIndex) {
        currentState = await skipMessageKeys(
            currentState,
            currentState.receivingChainIndex,
            message.chainIndex
        );
    }

    // Derive message key from current receiving chain
    if (!currentState.receivingChainKey) {
        throw new Error("No receiving chain key available for decryption");
    }

    const { nextChainKey, messageKey } = await symmetricRatchetStep(
        currentState.receivingChainKey
    );

    const plaintext = await aesGcmDecrypt(messageKey, message.ciphertext, message.iv);

    return {
        plaintext,
        nextState: {
            ...currentState,
            receivingChainKey: nextChainKey,
            receivingChainIndex: message.chainIndex + 1,
        },
    };
}

/** ─── Internal Helpers ─── */

/**
 * Perform a DH ratchet step: ECDH + HKDF to produce a new root key and chain key.
 */
async function dhRatchetStep(
    rootKey: CryptoKey,
    myPrivateKey: CryptoKey,
    theirPublicKeyJwk: JsonWebKey
): Promise<{ sendingChain: CryptoKey; newRootKey: CryptoKey }> {
    const theirPublicKey = await crypto.subtle.importKey(
        "jwk",
        theirPublicKeyJwk,
        { name: "ECDH", namedCurve: "P-256" },
        false,
        []
    );

    const dhOutput = await crypto.subtle.deriveBits(
        { name: "ECDH", public: theirPublicKey },
        myPrivateKey,
        256
    );

    // Use root key + DH output to derive new root key and chain key via HKDF
    const rootKeyRaw = await crypto.subtle.exportKey("raw", rootKey);
    const combined = concatBuffers(new Uint8Array(rootKeyRaw), new Uint8Array(dhOutput));

    const hkdfKey = await crypto.subtle.importKey("raw", combined, "HKDF", false, [
        "deriveKey",
        "deriveBits",
    ]);

    const newRootKey = await crypto.subtle.deriveKey(
        {
            name: "HKDF",
            hash: "SHA-256",
            salt: new TextEncoder().encode("livv-dr-root"),
            info: new TextEncoder().encode("root-key"),
        },
        hkdfKey,
        { name: "HMAC", hash: "SHA-256", length: 256 },
        true,
        ["sign"]
    );

    const chainKeyBits = await crypto.subtle.deriveBits(
        {
            name: "HKDF",
            hash: "SHA-256",
            salt: new TextEncoder().encode("livv-dr-chain"),
            info: new TextEncoder().encode("chain-key"),
        },
        hkdfKey,
        256
    );

    const sendingChain = await crypto.subtle.importKey(
        "raw",
        chainKeyBits,
        { name: "HMAC", hash: "SHA-256" },
        true,
        ["sign"]
    );

    return { sendingChain, newRootKey };
}

/**
 * Skip message keys and store them for out-of-order decryption.
 */
async function skipMessageKeys(
    state: DoubleRatchetState,
    fromIndex: number,
    toIndex: number
): Promise<DoubleRatchetState> {
    if (!state.receivingChainKey) return state;

    const stepsToSkip = toIndex - fromIndex;
    if (stepsToSkip > MAX_SKIP) {
        throw new Error(`Too many skipped messages: ${stepsToSkip}`);
    }

    let chainKey = state.receivingChainKey;
    const newSkipped = new Map(state.skippedMessageKeys);

    for (let i = fromIndex; i < toIndex; i++) {
        const { nextChainKey, messageKey } = await symmetricRatchetStep(chainKey);
        const keyId = makeSkippedKeyId(state.remoteDhPublicKey!, i);
        newSkipped.set(keyId, messageKey);
        chainKey = nextChainKey;
    }

    return {
        ...state,
        receivingChainKey: chainKey,
        receivingChainIndex: toIndex,
        skippedMessageKeys: newSkipped,
    };
}

function makeSkippedKeyId(dhPublicKey: JsonWebKey, index: number): string {
    return `${dhPublicKey.x}:${dhPublicKey.y}:${index}`;
}

function concatBuffers(a: Uint8Array, b: Uint8Array): ArrayBuffer {
    const result = new Uint8Array(a.length + b.length);
    result.set(a, 0);
    result.set(b, a.length);
    return result.buffer;
}
