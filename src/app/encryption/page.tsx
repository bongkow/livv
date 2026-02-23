"use client";

import Link from "next/link";

export default function EncryptionPage() {
    return (
        <div className="flex min-h-screen flex-col bg-black">
            {/* Header */}
            <header className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4">
                <div className="flex items-center gap-3">
                    <Link href="/" className="text-sm font-medium text-white/80 hover:text-white transition-colors">
                        livv
                    </Link>
                    <span className="text-[11px] text-white/20">encryption</span>
                </div>
            </header>

            <main className="flex-1 overflow-y-auto">
                <div className="mx-auto max-w-2xl px-5 py-10 space-y-16">
                    {/* Intro */}
                    <section className="space-y-4">
                        <h1 className="text-lg font-medium">End-to-End Encryption</h1>
                        <p className="text-sm text-white/50 leading-relaxed">
                            Every message you send on livv is encrypted on your device before it
                            leaves. The server relays ciphertext — it never sees your plaintext.
                            Your Ethereum wallet is your identity and your encryption key source.
                        </p>
                    </section>

                    {/* How it works overview */}
                    <section className="space-y-6">
                        <h2 className="text-sm font-medium text-white/70">How It Works</h2>
                        <div className="space-y-4">
                            <Step
                                number="1"
                                title="Sign In with Ethereum"
                                description="Your wallet (MetaMask) signs a message to authenticate. This is the identity you're known by in every room."
                            />
                            <Step
                                number="2"
                                title="Derive Encryption Keys"
                                description="When you join a room, your wallet signs a one-time message. The signature is hashed to produce an ECDH P-256 key pair — a public key (shared with peers) and a private key (never leaves your browser)."
                            />
                            <Step
                                number="3"
                                title="Key Exchange"
                                description="Your public key is broadcast to room members via WebSocket. The server sees the public key but cannot derive your private key. Peers use ECDH to establish shared secrets for secure key transport."
                            />
                            <Step
                                number="4"
                                title="Encrypt & Send"
                                description="Each message is encrypted with AES-256-GCM using a unique per-message key derived from a ratcheting chain. The server only ever sees the ciphertext."
                            />
                        </div>
                    </section>

                    <Divider />

                    {/* 1:1 Chat */}
                    <section className="space-y-6">
                        <div className="space-y-2">
                            <h2 className="text-sm font-medium text-white/70">1:1 Chat — Double Ratchet</h2>
                            <p className="text-xs text-white/30">
                                Used by Signal and WhatsApp for private conversations
                            </p>
                        </div>

                        <div className="border border-white/[0.08] p-4 space-y-4">
                            <p className="text-sm text-white/50 leading-relaxed">
                                Direct messages use the <strong className="text-white/70">Double Ratchet</strong> protocol,
                                which combines two mechanisms to provide the strongest possible encryption:
                            </p>

                            <ProtocolDetail
                                title="X3DH Handshake"
                                description="When two users start a 1:1 chat, they perform a triple Diffie-Hellman key exchange. Each side combines their identity key and a fresh ephemeral key to compute a shared root key. Neither the server nor any eavesdropper can derive this root key."
                            />

                            <ProtocolDetail
                                title="DH Ratchet (Post-Compromise Security)"
                                description="Every time the conversation direction changes (you send → they reply), a new ephemeral ECDH key pair is generated. This creates a completely fresh shared secret, 'healing' the session even if a previous key was compromised. An attacker who steals one key cannot read future messages after the next reply."
                            />

                            <ProtocolDetail
                                title="Symmetric Ratchet (Forward Secrecy)"
                                description="Between direction changes, each message derives a unique key from an HMAC chain. After deriving the next key, the old one is permanently deleted. Even if an attacker obtains a current key, they cannot reverse the chain to read past messages."
                            />
                        </div>

                        <SecurityBadges
                            badges={[
                                { label: "Forward Secrecy", active: true },
                                { label: "Post-Compromise Security", active: true },
                                { label: "Unique Key Per Message", active: true },
                            ]}
                        />

                        {/* Visual diagram */}
                        <div className="border border-white/[0.06] bg-white/[0.02] p-4 font-mono text-xs text-white/40 leading-relaxed whitespace-pre overflow-x-auto">
                            {`RootKey
  ├─ DH(Alice₁, Bob₀) → RootKey₁ + SendChain_A
  │    ├─ MsgKey₁  Alice → Bob
  │    └─ MsgKey₂  Alice → Bob
  │
  ├─ DH(Bob₁, Alice₁) → RootKey₂ + SendChain_B
  │    └─ MsgKey₃  Bob → Alice
  │
  └─ DH(Alice₂, Bob₁) → RootKey₃ + SendChain_A
       └─ MsgKey₄  Alice → Bob

Each DH step = new ephemeral keys = session heals
Each MsgKey = derived then deleted = can't go back`}
                        </div>
                    </section>

                    <Divider />

                    {/* Group Chat */}
                    <section className="space-y-6">
                        <div className="space-y-2">
                            <h2 className="text-sm font-medium text-white/70">Group Chat — Sender Keys</h2>
                            <p className="text-xs text-white/30">
                                Used by Signal and WhatsApp for group conversations
                            </p>
                        </div>

                        <div className="border border-white/[0.08] p-4 space-y-4">
                            <p className="text-sm text-white/50 leading-relaxed">
                                Group messages use <strong className="text-white/70">Sender Keys</strong>, where
                                each member maintains their own ratcheting chain. This avoids O(N) encryption
                                per message while preserving forward secrecy.
                            </p>

                            <ProtocolDetail
                                title="Per-Member Chain"
                                description="Each member generates their own chain key (ChainKey₀). When sending a message, they ratchet their chain forward to derive a unique MessageKey. All other members hold a copy of the chain and ratchet in sync."
                            />

                            <ProtocolDetail
                                title="Secure Distribution"
                                description="Chain keys are distributed to peers using ECDH-encrypted channels. Each member computes a pairwise shared secret with every other member to securely deliver their chain key. The server only sees encrypted blobs."
                            />

                            <ProtocolDetail
                                title="Re-Key on Leave"
                                description="When a member leaves, all remaining members generate new chain keys and redistribute them. This ensures the departed member cannot read future messages."
                            />
                        </div>

                        <SecurityBadges
                            badges={[
                                { label: "Forward Secrecy", active: true },
                                { label: "Post-Compromise Security", active: false },
                                { label: "Unique Key Per Message", active: true },
                            ]}
                        />

                        {/* Visual diagram */}
                        <div className="border border-white/[0.06] bg-white/[0.02] p-4 font-mono text-xs text-white/40 leading-relaxed whitespace-pre overflow-x-auto">
                            {`Alice's Chain:  CK₀ → CK₁ → CK₂ → CK₃ → ...
                 ↓     ↓     ↓     ↓
                MK₁   MK₂   MK₃   MK₄

Bob's Chain:    CK₀ → CK₁ → CK₂ → ...
                 ↓     ↓     ↓
                MK₁   MK₂   MK₃

Each member = own chain
Each message = unique key, old key deleted
CK = ChainKey, MK = MessageKey`}
                        </div>
                    </section>

                    <Divider />

                    {/* How messages are kept */}
                    <section className="space-y-6">
                        <h2 className="text-sm font-medium text-white/70">How Messages Are Stored</h2>

                        <div className="space-y-4">
                            <InfoBlock
                                title="In-Memory Only"
                                description="Decrypted messages exist only in your browser's memory. They are never written to disk, local storage, or any server database."
                            />
                            <InfoBlock
                                title="Session-Scoped"
                                description="When you close the tab or refresh, all decrypted messages and encryption keys are gone. There is no message history to leak."
                            />
                            <InfoBlock
                                title="Server Is Blind"
                                description="The WebSocket server relays encrypted blobs between peers. It has no access to plaintext, no stored keys, and no ability to decrypt — not now, not retroactively."
                            />
                            <InfoBlock
                                title="Forward Secrecy"
                                description="Even if an encryption key is somehow compromised, only the single message encrypted with that specific key is exposed. All other messages (past and future) remain protected."
                            />
                        </div>
                    </section>

                    <Divider />

                    {/* Cryptographic primitives */}
                    <section className="space-y-6">
                        <h2 className="text-sm font-medium text-white/70">Cryptographic Primitives</h2>

                        <div className="grid grid-cols-1 gap-3">
                            <PrimitiveRow name="Key Pair Derivation" value="ECDH P-256 (from Ethereum signature)" />
                            <PrimitiveRow name="Key Agreement" value="ECDH (Elliptic Curve Diffie-Hellman)" />
                            <PrimitiveRow name="Message Encryption" value="AES-256-GCM (authenticated encryption)" />
                            <PrimitiveRow name="KDF Chain" value="HMAC-SHA256 (key derivation function)" />
                            <PrimitiveRow name="Initial Handshake" value="X3DH (Extended Triple Diffie-Hellman)" />
                            <PrimitiveRow name="Runtime" value="Web Crypto API (native browser, no external libs)" />
                        </div>
                    </section>

                    {/* Spacer */}
                    <div className="h-10" />
                </div>
            </main>

            {/* Footer */}
            <footer className="border-t border-white/[0.08] px-5 py-3">
                <div className="flex items-center justify-between text-[11px] text-white/15">
                    <span>all encryption happens client-side · zero-knowledge server</span>
                    <Link href="/" className="hover:text-white/40 transition-colors">
                        ← back to rooms
                    </Link>
                </div>
            </footer>
        </div>
    );
}

/* ─── Sub-components ─── */

function Step({ number, title, description }: { number: string; title: string; description: string }) {
    return (
        <div className="flex gap-4">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center border border-white/[0.12] text-[11px] text-white/40">
                {number}
            </div>
            <div className="space-y-1 pt-0.5">
                <p className="text-sm font-medium text-white/60">{title}</p>
                <p className="text-xs text-white/35 leading-relaxed">{description}</p>
            </div>
        </div>
    );
}

function ProtocolDetail({ title, description }: { title: string; description: string }) {
    return (
        <div className="space-y-1">
            <p className="text-xs font-medium text-white/50">{title}</p>
            <p className="text-xs text-white/35 leading-relaxed">{description}</p>
        </div>
    );
}

function SecurityBadges({ badges }: { badges: { label: string; active: boolean }[] }) {
    return (
        <div className="flex flex-wrap gap-2">
            {badges.map((badge) => (
                <span
                    key={badge.label}
                    className={`px-2 py-1 text-[11px] border ${badge.active
                            ? "border-white/20 text-white/50"
                            : "border-white/[0.06] text-white/20 line-through"
                        }`}
                >
                    {badge.active ? "✓" : "✗"} {badge.label}
                </span>
            ))}
        </div>
    );
}

function InfoBlock({ title, description }: { title: string; description: string }) {
    return (
        <div className="border-l-2 border-white/[0.1] pl-4 space-y-1">
            <p className="text-sm font-medium text-white/50">{title}</p>
            <p className="text-xs text-white/35 leading-relaxed">{description}</p>
        </div>
    );
}

function PrimitiveRow({ name, value }: { name: string; value: string }) {
    return (
        <div className="flex items-baseline justify-between border-b border-white/[0.04] pb-2">
            <span className="text-xs text-white/40">{name}</span>
            <span className="text-xs text-white/25 font-mono">{value}</span>
        </div>
    );
}

function Divider() {
    return <div className="border-t border-white/[0.06]" />;
}
