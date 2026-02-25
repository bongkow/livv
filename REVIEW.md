# Livv Codebase Review

Full audit of the livv E2E encrypted chat application. Findings organized by severity.

---

## CRITICAL — Must Fix Before Production

### 1. Key Derivation is NOT Deterministic (Despite Claims)
**`src/crypto/generateEncryptionKeyPair.ts:105-137`**

The `deriveEcdhKeyFromSeed` function claims to derive a deterministic key pair from a seed, but it **generates a random key pair and ignores the seed entirely**:

```typescript
async function deriveEcdhKeyFromSeed(seed: ArrayBuffer): Promise<CryptoKey> {
    const keyPair = await crypto.subtle.generateKey(/* random */);
    const privateJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
    // ... modifies privateJwk.d with seed, but NEVER re-imports it ...
    return keyPair.privateKey; // returns the RANDOM key, not seed-derived
}
```

**Impact:** Every page refresh generates a different key pair. Users lose the ability to decrypt content from previous sessions. The entire premise in the module docstring ("same wallet + same channelHash always produces the same key pair") is false.

**Fix:** Either properly import the seed-derived JWK (requires computing `x,y` from `d`, which Web Crypto can't do directly — use a library like `@noble/curves`), or explicitly document that keys are ephemeral per-session and adjust the architecture accordingly.

### 2. `initiateDirectSession` Called With Own Address Instead of Peer's
**`src/hooks/useEncryptionSetup.ts:112`**

```typescript
const initMessage = await useEncryptionStore.getState().initiateDirectSession(walletAddress);
//                                                                            ^^^^^^^^^^^^^ BUG: should be peerAddr
```

The X3DH handshake is initiated with the user's **own** address instead of the peer's address. This means the handshake targets the wrong identity, and the shared secret computation will be incorrect.

**Fix:**
```typescript
const initMessage = await useEncryptionStore.getState().initiateDirectSession(peerAddr);
```

### 3. Double Ratchet `previousChainLength` Bug
**`src/crypto/doubleRatchet.ts:85-86`**

```typescript
previousChainLength: state.sendingChainIndex,
chainIndex: state.sendingChainIndex,
```

Both fields are set to the same value. `previousChainLength` should track how many messages were sent on the **previous** sending chain (before the last DH ratchet), not the current chain's index. The receiver uses this to skip old chain keys (line 142). This causes **message decryption failures** whenever a DH ratchet step occurs with in-flight messages.

**Fix:** Track `previousSendingChainLength` in `DoubleRatchetState` and set it correctly when the DH ratchet advances.

### 4. Concurrent Encrypt/Decrypt Clobbers Ratchet State
**`src/stores/useEncryptionStore.ts:301-323, 326-366`**

Both `encryptOutgoing` and `decryptIncoming` do `get()` → async crypto → `set(nextState)`. If two messages are processed concurrently, both read the **same** ratchet state, and the second `set()` overwrites the first — permanently desynchronizing the ratchet.

**Fix:** Serialize encrypt/decrypt operations with an async mutex/queue.

---

## HIGH — Significant Bugs & Security Issues

### 5. No AAD on AES-GCM — Metadata is Unauthenticated
**`src/crypto/aesGcm.ts:21-25`**

AES-GCM is used without `additionalData`. The `senderAddress`, `chainIndex`, `senderDhPublicKey`, and `previousChainLength` fields are all transmitted in plaintext alongside the ciphertext and are **not authenticated**. A malicious server or MITM could change who a message appears to be from without detection.

**Fix:** Pass message metadata as AAD to `crypto.subtle.encrypt/decrypt`.

### 6. WebSocket Reconnect Uses Stale JWT
**`src/stores/useWebSocketStore.ts:60-62`**

The `onclose` handler captures `jwt` and `channel` from the closure of the original `connect()` call. On reconnect, the stale JWT may be expired or belong to a different session.

**Fix:** Store `jwt` and `channel` in the Zustand state so reconnect reads the latest values.

### 7. `connect()` Doesn't Guard Against CONNECTING State
**`src/stores/useWebSocketStore.ts:31-32`**

```typescript
if (existing && existing.readyState === WebSocket.OPEN) return;
```

Only guards against `OPEN`, not `CONNECTING`. Double-calling `connect()` (e.g., React Strict Mode) creates a zombie socket that fires callbacks and corrupts state.

**Fix:** Also check `WebSocket.CONNECTING`.

### 8. Presence Broadcast May Omit Public Key
**`src/hooks/usePresence.ts:31-44`**

The `hasBroadcastedJoin` ref is set to `true` on the first broadcast, even if `encryptionKeyPair` is null at that time. The public key is then never sent to peers.

**Fix:** Gate on `!encryptionKeyPair` in the guard condition, or re-broadcast when the key pair becomes available.

### 9. Old Socket's `onclose` Can Destroy New Connection
**`src/stores/useWebSocketStore.ts:52-64`**

After `disconnect()` + `connect()`, the old socket's `onclose` callback fires and overwrites the new connection's state with `{ connectionStatus: "disconnected", socket: null }`.

**Fix:** Track a connection ID. In `onclose`, verify the callback's socket matches the current socket before updating state.

### 10. Silent Plaintext Fallback Undermines E2E Promise
**`src/hooks/useChatConnection.ts:130-135`**

When encryption isn't ready, messages are sent in **plaintext** with no user warning. This silently undermines the core E2E encryption promise.

**Fix:** At minimum, show a clear visual indicator. Better: block sending until encryption is ready, or require user confirmation before sending unencrypted.

### 11. DynamoDB Full Table Scan Without Pagination or Auth
**`src/app/actions/fetchRoom.ts:44-54`**

`fetchAllRooms()` does a full `ScanCommand` with no pagination (`LastEvaluatedKey`), no authentication check, no rate limiting, and no result limit. DynamoDB scans are capped at 1MB — results will be silently truncated if the table grows.

**Fix:** Add pagination loop, auth check, and `Limit` parameter.

### 12. Reconnect Timer Never Cancelled
**`src/stores/useWebSocketStore.ts:58-63`**

The `setTimeout` ID is never stored. When `disconnect()` is called, a pending reconnect timer will fire and create a new connection after the user explicitly disconnected.

**Fix:** Store the timeout ID and clear it in `disconnect()`.

### 13. `encryptionStatus` Set to "ready" Before Handshake Completes
**`src/hooks/useEncryptionSetup.ts:124-127`**

For direct mode, only the X3DH init message has been **sent** — the response hasn't been received yet. Setting status to "ready" causes `encryptOutgoing` to be called while `doubleRatchetState` is still null, silently falling back to plaintext.

---

## MEDIUM — Should Fix

### 14. No Error Boundaries
**`src/app/layout.tsx`**

No React Error Boundary exists anywhere. No `error.tsx` pages for Next.js App Router error handling. A single thrown error in any client component crashes the entire app to a white screen.

### 15. JWT in WebSocket URL Query String
**`src/stores/useWebSocketStore.ts:36`**

The JWT appears in server logs, browser history, proxy logs, and Referer headers.

### 16. Client Controls Token Expiration
**`src/config/appConfig.ts:8`**

`tokenExpirationHour: 24` is sent to the auth API in the request body. A malicious client could request arbitrarily long-lived tokens.

### 17. Sign Message Vulnerable to Replay
**`src/config/appConfig.ts:9-11`**

The sign message uses `toLocaleString()` (minute-level granularity) with no nonce. Two requests within the same minute produce identical signatures.

### 18. Hardcoded WebSocket/API URLs
**`src/config/appConfig.ts:5-6`**

URLs should come from `process.env.NEXT_PUBLIC_*` environment variables for dev/staging/prod flexibility.

### 19. Hardcoded DynamoDB Table Name
**`src/app/actions/fetchRoom.ts:8`**

Should be `process.env.ROOMS_TABLE_NAME`.

### 20. No Error Handling in Server Actions
**`src/app/actions/fetchRoom.ts:27-54`**

Neither `fetchRoomByName` nor `fetchAllRooms` has try/catch. DynamoDB errors will surface as opaque 500s.

### 21. `addOnlineUser` Race Condition
**`src/stores/useChatStore.ts:52-56`**

Uses `get()` + `set()` pattern instead of the functional updater `set((state) => ...)`. Two simultaneous joins can overwrite each other.

### 22. No Input Validation on `fetchRoomByName`
**`src/app/actions/fetchRoom.ts:27`**

Empty strings, extremely long strings, or special characters are silently accepted.

### 23. Unsafe Type Assertions on DynamoDB Results
**`src/app/actions/fetchRoom.ts:41, 53`**

`as RoomData` trusts DynamoDB data without runtime validation.

### 24. Encryption State Not Reset on Reconnect
Old ratchet states, peer keys, and sender keys persist across WebSocket disconnects. On reconnect, the stale encryption state is used against potentially different peers.

### 25. `isRoomFull` Uses `>` Instead of `>=`
**`src/hooks/useChatConnection.ts:40`**

A 1:1 room with `maxPeersPerRoom=2` allows 3 users before being considered "full".

### 26. Unbounded Message Array Growth
**`src/stores/useChatStore.ts:47`**

Messages accumulate indefinitely with no cap. Long-running sessions will consume increasing memory.

### 27. Room Not Found Has No User Feedback
**`src/hooks/useChatConnection.ts:64-66`**

Navigating to a nonexistent room shows an infinite spinner with no error message.

### 28. RoomCard Shows Hardcoded "0/N" Occupancy
**`src/components/RoomCard.tsx:27`**

The occupancy counter always shows `0`, never reflecting actual room population.

### 29. `maxPeersPerRoom` Default Scattered Across 6+ Files
The fallback `?? 2` appears in ChatRoom, RoomCard, PeersInRoom, and useChatConnection. Should be a single constant.

---

## LOW — Nice to Have

### 30. Accessibility Issues
- No `aria-label` on status dots, encryption badges, spinner (`ChatRoom.tsx`)
- No `<label>` on message input (`MessageInput.tsx:34`)
- Room "enter" buttons all have identical label — screen readers can't distinguish (`RoomCard.tsx:37`)
- Message list has no `aria-live` region for incoming messages (`MessageList.tsx:17`)
- Peers sidebar hidden on mobile with no alternative (`ChatRoom.tsx:72`)
- Disconnect button at 30% opacity white fails WCAG contrast requirements (`ConnectWalletButton.tsx:36`)
- Navigation `<button>` should be `<Link>` (`chat/page.tsx:37-42`)

### 31. Performance
- `MessageBubble` not memoized — all bubbles re-render on every new message (`MessageList.tsx:31`)
- `handleEnterRoom` not wrapped in `useCallback` (`page.tsx:21`)
- Auto-scroll fires unconditionally, even when user is reading history (`MessageList.tsx:12-15`)
- No loading indicator for room grid (`RoomGrid.tsx`)

### 32. Crypto Hardening
- All HKDF salts are static strings — consider random salts where applicable
- No incoming JWK public key validation (crv, kty checks) before import
- Root key exported as raw bytes — could use HKDF with DH output as salt instead
- All chain keys are extractable even when they don't need to be
- No zeroing of intermediate key material (ArrayBuffers)
- Skipped message keys have no TTL — they accumulate indefinitely

### 33. No Test Suite
Zero test files, no test configuration, no test dependencies. The crypto module (~1300 LOC) has no tests. This is the highest-risk code in the application.

### 34. Build Fails — Google Fonts Fetch
The `next build` fails because it tries to fetch Inter from Google Fonts at build time. Consider self-hosting the font or using `next/font/local`.

---

## Summary

| Severity | Count | Key Themes |
|----------|-------|------------|
| **CRITICAL** | 4 | Non-deterministic keys, wrong handshake target, ratchet bugs, concurrent state corruption |
| **HIGH** | 9 | Unauthenticated AES-GCM metadata, WebSocket reconnection bugs, silent plaintext fallback |
| **MEDIUM** | 16 | Missing error handling, hardcoded config, input validation, accessibility |
| **LOW** | 5 | Performance, crypto hardening, test coverage |

The most urgent items: fix the key derivation (#1), the handshake address bug (#2), the `previousChainLength` bug (#3), and add encrypt/decrypt serialization (#4). These four issues make the encryption fundamentally broken in its current state.
