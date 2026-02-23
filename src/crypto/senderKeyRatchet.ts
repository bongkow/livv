/**
 * Sender Key ratchet for group E2E encrypted chats.
 *
 * Each member maintains their own ratcheting chain.
 * When sending, the sender ratchets their chain and encrypts.
 * Receivers hold copies of each sender's chain and ratchet in sync.
 */

import {
    ratchetStep,
    ratchetToIndex,
    createRandomChainKey,
} from "./symmetricRatchet";
import { aesGcmEncrypt, aesGcmDecrypt } from "./aesGcm";
import type { SenderKeyState, EncryptedMessage } from "./types";

/**
 * Create a new sender key state for this user.
 * Called when joining a room or re-keying after a member leaves.
 */
export async function createSenderKeyState(
    senderAddress: string
): Promise<SenderKeyState> {
    const chainKey = await createRandomChainKey();
    return {
        senderAddress,
        chainKey,
        chainIndex: 0,
        skippedMessageKeys: new Map(),
    };
}

/**
 * Encrypt a message using the sender's own chain.
 * Ratchets forward, encrypts, and returns the updated state.
 */
export async function encryptWithSenderKey(
    state: SenderKeyState,
    plaintext: string
): Promise<{
    encrypted: EncryptedMessage;
    nextState: SenderKeyState;
}> {
    const { nextChainKey, messageKey } = await ratchetStep(state.chainKey);
    const { ciphertext, iv } = await aesGcmEncrypt(messageKey, plaintext);

    const encrypted: EncryptedMessage = {
        senderAddress: state.senderAddress,
        chainIndex: state.chainIndex,
        ciphertext,
        iv,
    };

    const nextState: SenderKeyState = {
        ...state,
        chainKey: nextChainKey,
        chainIndex: state.chainIndex + 1,
        skippedMessageKeys: new Map(), // sender doesn't need skipped keys
    };

    return { encrypted, nextState };
}

/**
 * Decrypt a message using the sender's chain copy.
 * Handles out-of-order messages by storing skipped keys.
 */
export async function decryptWithSenderKey(
    state: SenderKeyState,
    encrypted: EncryptedMessage
): Promise<{
    plaintext: string;
    nextState: SenderKeyState;
}> {
    // Check if we have a skipped key for this index
    const skippedKey = state.skippedMessageKeys.get(encrypted.chainIndex);
    if (skippedKey) {
        const plaintext = await aesGcmDecrypt(skippedKey, encrypted.ciphertext, encrypted.iv);
        const newSkipped = new Map(state.skippedMessageKeys);
        newSkipped.delete(encrypted.chainIndex);
        return {
            plaintext,
            nextState: { ...state, skippedMessageKeys: newSkipped },
        };
    }

    // Need to ratchet forward to the target index
    if (encrypted.chainIndex < state.chainIndex) {
        throw new Error(
            `Message index ${encrypted.chainIndex} is behind current chain index ${state.chainIndex}. Key may have been deleted.`
        );
    }

    if (encrypted.chainIndex === state.chainIndex) {
        // Current position — normal ratchet step
        const { nextChainKey, messageKey } = await ratchetStep(state.chainKey);
        const plaintext = await aesGcmDecrypt(messageKey, encrypted.ciphertext, encrypted.iv);

        return {
            plaintext,
            nextState: {
                ...state,
                chainKey: nextChainKey,
                chainIndex: state.chainIndex + 1,
            },
        };
    }

    // Out-of-order: ratchet forward, saving skipped keys
    const { chainKey, messageKey, skippedKeys } = await ratchetToIndex(
        state.chainKey,
        state.chainIndex,
        encrypted.chainIndex
    );

    const plaintext = await aesGcmDecrypt(messageKey, encrypted.ciphertext, encrypted.iv);

    // Merge skipped keys
    const mergedSkipped = new Map(state.skippedMessageKeys);
    for (const [index, key] of skippedKeys) {
        mergedSkipped.set(index, key);
    }

    return {
        plaintext,
        nextState: {
            senderAddress: state.senderAddress,
            chainKey,
            chainIndex: encrypted.chainIndex + 1,
            skippedMessageKeys: mergedSkipped,
        },
    };
}
