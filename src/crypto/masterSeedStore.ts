/**
 * Non-extractable master seed storage using IndexedDB.
 *
 * The master E2E seed is imported as an HKDF CryptoKey with extractable=false
 * and stored in IndexedDB. This means:
 *   - The raw seed bytes can never be read back by JavaScript
 *   - XSS attacks cannot exfiltrate the seed
 *   - The CryptoKey can only be used for HKDF deriveBits/deriveKey operations
 *
 * CryptoKey objects survive IndexedDB storage via the structured clone algorithm.
 */

const DB_NAME = "livv-e2e";
const STORE_NAME = "master-seeds";
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Import raw seed bytes as a non-extractable HKDF CryptoKey and store in IndexedDB.
 */
export async function storeMasterSeed(address: string, seedBuffer: ArrayBuffer): Promise<void> {
    const masterKey = await crypto.subtle.importKey(
        "raw",
        seedBuffer,
        "HKDF",
        false, // non-extractable — the raw bytes can never be read back
        ["deriveBits"]
    );

    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).put(masterKey, address.toLowerCase());
        tx.oncomplete = () => {
            db.close();
            resolve();
        };
        tx.onerror = () => {
            db.close();
            reject(tx.error);
        };
    });
}

/**
 * Retrieve the non-extractable HKDF CryptoKey from IndexedDB.
 * Returns null if no seed is stored for this address.
 */
export async function getMasterSeedKey(address: string): Promise<CryptoKey | null> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const request = tx.objectStore(STORE_NAME).get(address.toLowerCase());
        request.onsuccess = () => {
            db.close();
            resolve(request.result ?? null);
        };
        request.onerror = () => {
            db.close();
            reject(request.error);
        };
    });
}

/**
 * Check whether a master seed exists in IndexedDB for this address.
 */
export async function hasMasterSeed(address: string): Promise<boolean> {
    const key = await getMasterSeedKey(address);
    return key !== null;
}

/**
 * Delete the stored master seed for an address.
 */
export async function deleteMasterSeed(address: string): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).delete(address.toLowerCase());
        tx.oncomplete = () => {
            db.close();
            resolve();
        };
        tx.onerror = () => {
            db.close();
            reject(tx.error);
        };
    });
}

/**
 * Migrate a hex seed from localStorage to IndexedDB as a non-extractable CryptoKey.
 * Returns the CryptoKey if migration occurred, null if no localStorage seed found.
 */
export async function migrateFromLocalStorage(
    address: string,
    localStorageKey: string
): Promise<CryptoKey | null> {
    const seedHex = localStorage.getItem(localStorageKey);
    if (!seedHex) return null;

    const seedBytes = new Uint8Array(
        seedHex.match(/.{2}/g)!.map((b) => parseInt(b, 16))
    );

    await storeMasterSeed(address, seedBytes.buffer);
    localStorage.removeItem(localStorageKey);

    return await getMasterSeedKey(address);
}
