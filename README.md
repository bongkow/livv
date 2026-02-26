# livv

Anonymous, end-to-end encrypted communication powered by Ethereum wallets.

> **v0.1.0-beta** — actively under development

## What is livv?

livv is a privacy-first chat platform where identity is your Ethereum address — nothing more. Messages are encrypted on your device before they leave, meaning **not even the server can read what you say**.

- **No accounts, no emails** — sign in with MetaMask
- **End-to-end encryption** — the server is a relay, not a reader
- **Pseudonymous** — your wallet address is your only identity

## How It Works

### Authentication

1. Connect your MetaMask wallet
2. Sign a message to prove address ownership
3. Receive a JWT from the auth API — used only for WebSocket connections

### Encryption

All cryptographic operations run **entirely in the browser** using the Web Crypto API. No keys ever leave your device.

| Room Type | Protocol | Description |
|-----------|----------|-------------|
| **1:1** | X3DH → Double Ratchet | Signal-style key exchange and forward-secret messaging |
| **Group** | Sender Keys | Each participant generates a sender key, shared via ECDH envelope encryption |

**Key derivation**: A deterministic master seed is derived from a one-time wallet signature (`SHA-256`), then per-room key pairs are generated from the seed + channel hash. This means the same wallet always produces the same keys — no key management needed.

**Forward secrecy**: The Double Ratchet protocol ratchets keys after every message in 1:1 rooms. Group rooms use symmetric ratcheting on sender keys, with automatic re-keying when a member leaves.

### Real-Time Communication

- WebSocket connection to `wss://ws.bongkow.com` with auto-reconnect and exponential backoff
- Presence system: `user_joined` / `i_am_here` / `user_left` broadcasts
- Encryption public keys are piggy-backed on presence messages — no extra round trips

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (Turbopack) |
| Language | TypeScript |
| State Management | Zustand |
| Styling | Tailwind CSS 4 |
| Wallet | ethers.js v6 + MetaMask |
| Encryption | Web Crypto API (ECDH P-256, AES-256-GCM, HKDF) |
| Backend | AWS API Gateway WebSocket + Lambda + DynamoDB |

## Project Structure

```
src/
├── app/                    # Next.js pages
│   ├── page.tsx            # Landing — room grid
│   ├── chat/page.tsx       # Chat room view
│   └── encryption/page.tsx # Encryption info page
├── components/             # UI components
│   ├── ChatRoom.tsx        # Chat room layout + exit button
│   ├── MessageList.tsx     # Message display
│   ├── MessageInput.tsx    # Compose bar
│   ├── PeersInRoom.tsx     # Online presence sidebar
│   ├── RoomCard.tsx        # Room card in grid
│   ├── RoomGrid.tsx        # Room listing
│   └── ConnectWalletButton.tsx
├── crypto/                 # E2E encryption module
│   ├── x3dh.ts             # X3DH key exchange (1:1)
│   ├── doubleRatchet.ts    # Double Ratchet (1:1)
│   ├── senderKeyRatchet.ts # Sender key ratchet (group)
│   ├── senderKeyDistribution.ts  # Sender key distribution
│   ├── deriveSharedSecret.ts     # ECDH shared secret
│   ├── symmetricRatchet.ts       # Symmetric key ratchet
│   ├── aesGcm.ts           # AES-256-GCM encrypt/decrypt
│   ├── generateEncryptionKeyPair.ts # Deterministic key derivation
│   └── types.ts            # Shared crypto types
├── hooks/                  # React hooks
│   ├── useChatConnection.ts    # Room lifecycle orchestrator
│   ├── useEncryptionSetup.ts   # Encryption handshake orchestration
│   └── usePresence.ts         # Presence broadcast
├── stores/                 # Zustand stores
│   ├── useAuthStore.ts         # Wallet auth + JWT
│   ├── useChatStore.ts         # Messages + online users
│   ├── useEncryptionStore.ts   # Crypto state + protocol actions
│   ├── useWebSocketStore.ts    # WebSocket connection
│   └── useRoomsStore.ts        # Room list
├── config/
│   └── appConfig.ts        # App-wide config
└── utils/                  # Helpers
    ├── hashRoomName.ts
    ├── isTokenExpired.ts
    └── truncateAddress.ts
```

## Getting Started

### Prerequisites

- Node.js 18+
- Yarn
- MetaMask browser extension

### Install & Run

```bash
yarn install
yarn dev
```

Open [http://localhost:3000](http://localhost:3000), connect your wallet, and enter a room.

### Version Scripts

```bash
yarn version:patch   # 0.1.0 → 0.1.1
yarn version:minor   # 0.1.0 → 0.2.0
yarn version:major   # 0.1.0 → 1.0.0
```

## Security Model

| Guarantee | How |
|-----------|-----|
| **Confidentiality** | AES-256-GCM encryption; server only sees ciphertext |
| **Authentication** | Wallet signature proves address ownership |
| **Forward Secrecy** | Double Ratchet ratchets keys every message (1:1); re-key on member leave (group) |
| **No Trust in Server** | All encryption/decryption happens client-side; server is a dumb relay |
| **Pseudonymity** | No PII — only Ethereum addresses |

## License

Private — All rights reserved.
