/*
 * @Module: EncryptionPage (How It Works)
 * @Purpose: Visual explainer of livv's auth flow and encryption architecture
 * @Logic: Pure presentational — no state, no side effects. Sections: Auth Flow, Encryption Overview, 1:1 Double Ratchet, Group Sender Keys, Storage, Primitives.
 * @Interfaces: default export EncryptionPage
 * @Constraints: No external icon libraries — inline SVGs only
 */
"use client";

import Link from "next/link";
import { appConfig } from "@/config/appConfig";

export default function EncryptionPage() {
    return (
        <div className="flex min-h-screen flex-col bg-black">
            {/* Header */}
            <header className="flex items-center justify-between border-b border-white/[0.08] backdrop-blur-md bg-black/50 px-5 py-4">
                <div className="flex items-center gap-4">
                    <Link
                        href="/"
                        className="text-base font-light tracking-wide text-white/80 hover:text-white transition-colors"
                    >
                        livv
                    </Link>
                    <span className="text-[10px] text-white/20 font-mono">
                        v{appConfig.appVersion}
                    </span>
                    <div className="h-3 w-px bg-white/10" />
                    <span className="text-xs text-white/30">how it works</span>
                </div>
            </header>

            <main className="flex-1 overflow-y-auto">
                <div className="mx-auto max-w-3xl px-5 py-12 space-y-20">
                    {/* Hero */}
                    <section className="space-y-4 animate-fade-in-up">
                        <h1 className="text-3xl md:text-4xl font-light tracking-tight bg-gradient-to-br from-white to-white/50 bg-clip-text text-transparent">
                            How livv Works
                        </h1>
                        <p className="text-sm md:text-base text-white/50 leading-relaxed max-w-xl">
                            Your wallet is your identity. Your device does all the encryption.
                            The server is blind — it relays ciphertext, never plaintext.
                        </p>
                    </section>

                    {/* ────── AUTH FLOW ────── */}
                    <section
                        className="space-y-8 animate-fade-in-up"
                        style={{ "--delay": "100ms" } as React.CSSProperties}
                    >
                        <SectionHeader
                            label="01"
                            title="Authentication"
                            subtitle="No email, no password — just your Ethereum wallet"
                        />

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <FlowCard
                                step="1"
                                icon={<MetaMaskIcon />}
                                title="Connect Wallet"
                                description="Click 'Connect Wallet' to link your MetaMask. livv requests your public address — nothing else."
                            />
                            <FlowCard
                                step="2"
                                icon={<SignIcon />}
                                title="Sign a Message"
                                description="Your wallet signs a challenge message to prove ownership. This signature never leaves your browser."
                            />
                            <FlowCard
                                step="3"
                                icon={<TokenIcon />}
                                title="Get Session Token"
                                description="The server verifies the signature and issues a short-lived JWT. Your wallet address is your only identity."
                            />
                        </div>

                        {/* Flow connector (desktop only) */}
                        <div className="hidden md:flex items-center justify-center gap-2 -mt-4">
                            <span className="text-[10px] text-white/20 font-mono">
                                wallet → signature → JWT → encrypted session
                            </span>
                        </div>
                    </section>

                    {/* ────── ENCRYPTION OVERVIEW ────── */}
                    <section
                        className="space-y-8 animate-fade-in-up"
                        style={{ "--delay": "200ms" } as React.CSSProperties}
                    >
                        <SectionHeader
                            label="02"
                            title="End-to-End Encryption"
                            subtitle="Messages are encrypted on your device before they leave"
                        />

                        {/* Visual flow diagram */}
                        <div className="bg-white/[0.03] rounded-xl p-6 md:p-8 space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                                <DiagramNode
                                    icon="✏️"
                                    label="You type"
                                    sublabel="plaintext"
                                    accent={false}
                                />
                                <DiagramNode
                                    icon="🔒"
                                    label="Encrypted"
                                    sublabel="on your device"
                                    accent={true}
                                />
                                <DiagramNode
                                    icon="☁️"
                                    label="Server relays"
                                    sublabel="ciphertext only"
                                    accent={false}
                                />
                                <DiagramNode
                                    icon="🔓"
                                    label="Peer decrypts"
                                    sublabel="on their device"
                                    accent={true}
                                />
                            </div>

                            {/* Arrow line (desktop) */}
                            <div className="hidden md:block relative h-px bg-gradient-to-r from-emerald-400/30 via-emerald-400/10 to-emerald-400/30 -mt-3" />

                            <p className="text-xs text-white/30 leading-relaxed text-center">
                                The server is a relay, not a reader. It has no keys, no
                                plaintext, no ability to decrypt — not now, not retroactively.
                            </p>
                        </div>
                    </section>

                    {/* ────── KEY DERIVATION ────── */}
                    <section
                        className="space-y-8 animate-fade-in-up"
                        style={{ "--delay": "300ms" } as React.CSSProperties}
                    >
                        <SectionHeader
                            label="03"
                            title="Key Derivation"
                            subtitle="Sign once, derive many — no wallet popup per room"
                        />

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <InfoCard
                                title="Master Seed"
                                description="At sign-in, your wallet signs a one-time message. The signature is hashed (SHA-256) to create a master seed stored as a non-extractable CryptoKey in IndexedDB — safe from XSS."
                            />
                            <InfoCard
                                title="Per-Room Keys"
                                description="Each room derives its own ECDH P-256 key pair via HKDF(masterSeed, roomHash). This happens locally and silently — no wallet popup needed."
                            />
                        </div>

                        {/* Derivation diagram */}
                        <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-4 font-mono text-xs text-white/35 leading-relaxed whitespace-pre overflow-x-auto">
                            {`Wallet Signature
  └─ SHA-256 → Master Seed (IndexedDB, non-extractable)
       ├─ HKDF(seed, "room-alpha") → ECDH Key Pair₁
       ├─ HKDF(seed, "room-beta")  → ECDH Key Pair₂
       └─ HKDF(seed, "room-N")     → ECDH Key PairN`}
                        </div>
                    </section>

                    {/* ────── 1:1 DOUBLE RATCHET ────── */}
                    <section
                        className="space-y-8 animate-fade-in-up"
                        style={{ "--delay": "400ms" } as React.CSSProperties}
                    >
                        <SectionHeader
                            label="04"
                            title="1:1 Chat — Double Ratchet"
                            subtitle="Signal-level protocol for private conversations"
                        />

                        <div className="space-y-4">
                            <ProtocolCard
                                title="X3DH Handshake"
                                description="Both sides combine their identity key and a fresh ephemeral key via triple Diffie-Hellman to compute a shared root key. Neither the server nor any eavesdropper can derive this."
                            />
                            <ProtocolCard
                                title="DH Ratchet — Post-Compromise Security"
                                description="Every time the conversation direction changes, a new ephemeral ECDH key pair is generated. This creates a fresh shared secret, 'healing' the session even if a previous key was compromised."
                            />
                            <ProtocolCard
                                title="Symmetric Ratchet — Forward Secrecy"
                                description="Between direction changes, each message derives a unique key from an HMAC chain. After deriving the next key, the old one is permanently deleted. Past messages stay safe even if a current key leaks."
                            />
                        </div>

                        <BadgeRow
                            badges={[
                                { label: "Forward Secrecy", active: true },
                                { label: "Post-Compromise Security", active: true },
                                { label: "Unique Key Per Message", active: true },
                            ]}
                        />

                        {/* Ratchet diagram */}
                        <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-4 font-mono text-xs text-white/35 leading-relaxed whitespace-pre overflow-x-auto">
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

                    {/* ────── GROUP SENDER KEYS ────── */}
                    <section
                        className="space-y-8 animate-fade-in-up"
                        style={{ "--delay": "500ms" } as React.CSSProperties}
                    >
                        <SectionHeader
                            label="05"
                            title="Group Chat — Sender Keys"
                            subtitle="Efficient group encryption with per-member chains"
                        />

                        <div className="space-y-4">
                            <ProtocolCard
                                title="Per-Member Chain"
                                description="Each member generates their own chain key. When sending, they ratchet forward to derive a unique MessageKey. All other members hold a copy and ratchet in sync."
                            />
                            <ProtocolCard
                                title="Secure Distribution"
                                description="Chain keys are distributed via ECDH-encrypted pairwise channels. Each member computes a shared secret with every peer to securely deliver their key. The server only sees encrypted blobs."
                            />
                            <ProtocolCard
                                title="Re-Key on Leave"
                                description="When a member leaves, all remaining members generate new chain keys. The departed member cannot read any future messages."
                            />
                        </div>

                        <BadgeRow
                            badges={[
                                { label: "Forward Secrecy", active: true },
                                { label: "Post-Compromise Security", active: false },
                                { label: "Unique Key Per Message", active: true },
                            ]}
                        />

                        {/* Chain diagram */}
                        <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-4 font-mono text-xs text-white/35 leading-relaxed whitespace-pre overflow-x-auto">
                            {`Alice's Chain:  CK₀ → CK₁ → CK₂ → CK₃ → ...
                 ↓     ↓     ↓     ↓
                MK₁   MK₂   MK₃   MK₄

Bob's Chain:    CK₀ → CK₁ → CK₂ → ...
                 ↓     ↓     ↓
                MK₁   MK₂   MK₃

Each member = own chain
Each message = unique key, old key deleted`}
                        </div>
                    </section>

                    {/* ────── MESSAGE STORAGE ────── */}
                    <section
                        className="space-y-8 animate-fade-in-up"
                        style={{ "--delay": "600ms" } as React.CSSProperties}
                    >
                        <SectionHeader
                            label="06"
                            title="Ephemeral by Design"
                            subtitle="No logs, no history, no trace"
                        />

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <InfoCard
                                title="In-Memory Only"
                                description="Decrypted messages exist only in browser memory. Never written to disk, localStorage, or any database."
                            />
                            <InfoCard
                                title="Session-Scoped"
                                description="Close the tab or refresh — all messages and encryption keys are gone. No history to leak."
                            />
                            <InfoCard
                                title="Server Is Blind"
                                description="The WebSocket server relays encrypted blobs. It has no plaintext, no stored keys, and no ability to decrypt."
                            />
                            <InfoCard
                                title="Forward Secrecy"
                                description="Even if a key is compromised, only the single message encrypted with that specific key is exposed. All others remain safe."
                            />
                        </div>
                    </section>

                    {/* ────── CRYPTO PRIMITIVES ────── */}
                    <section
                        className="space-y-8 animate-fade-in-up"
                        style={{ "--delay": "700ms" } as React.CSSProperties}
                    >
                        <SectionHeader
                            label="07"
                            title="Cryptographic Primitives"
                            subtitle="Standards-based, browser-native"
                        />

                        <div className="bg-white/[0.03] rounded-xl overflow-hidden">
                            {[
                                ["Key Pair Derivation", "ECDH P-256 (from Ethereum signature)"],
                                ["Key Agreement", "ECDH (Elliptic Curve Diffie-Hellman)"],
                                ["Message Encryption", "AES-256-GCM (authenticated)"],
                                ["KDF Chain", "HMAC-SHA256"],
                                ["Initial Handshake", "X3DH (Extended Triple Diffie-Hellman)"],
                                ["Runtime", "Web Crypto API (native, no external libs)"],
                            ].map(([name, value], i) => (
                                <div
                                    key={name}
                                    className={`flex items-baseline justify-between px-5 py-3 ${i > 0 ? "border-t border-white/[0.06]" : ""
                                        }`}
                                >
                                    <span className="text-xs text-white/50">{name}</span>
                                    <span className="text-xs text-white/25 font-mono">
                                        {value}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* Bottom spacer */}
                    <div className="h-8" />
                </div>
            </main>

            {/* Footer */}
            <footer className="border-t border-white/[0.08] backdrop-blur-md bg-black/50 px-5 py-3">
                <div className="flex items-center justify-between text-[11px] text-white/30">
                    <span>all encryption happens client-side · zero-knowledge server</span>
                    <Link
                        href="/"
                        className="hover:text-white/50 transition-colors"
                    >
                        ← back to home
                    </Link>
                </div>
            </footer>
        </div>
    );
}

/* ─── Sub-components ─── */

function SectionHeader({
    label,
    title,
    subtitle,
}: {
    label: string;
    title: string;
    subtitle: string;
}) {
    return (
        <div className="space-y-2">
            <div className="flex items-center gap-3">
                <span className="flex items-center justify-center w-7 h-7 rounded-full bg-emerald-400/10 text-emerald-400/60 text-[11px] font-mono">
                    {label}
                </span>
                <h2 className="text-lg font-medium text-white/80">{title}</h2>
            </div>
            <p className="text-xs text-white/30 pl-10">{subtitle}</p>
        </div>
    );
}

function FlowCard({
    step,
    icon,
    title,
    description,
}: {
    step: string;
    icon: React.ReactNode;
    title: string;
    description: string;
}) {
    return (
        <div className="relative bg-white/[0.03] rounded-xl p-5 space-y-3 transition-all duration-300 hover:bg-white/[0.06]">
            <div className="flex items-center gap-3">
                <span className="text-emerald-400/40 shrink-0">{icon}</span>
                <span className="text-[10px] text-white/20 font-mono">
                    step {step}
                </span>
            </div>
            <h3 className="text-sm font-medium text-white/70">{title}</h3>
            <p className="text-xs text-white/30 leading-relaxed">{description}</p>
        </div>
    );
}

function DiagramNode({
    icon,
    label,
    sublabel,
    accent,
}: {
    icon: string;
    label: string;
    sublabel: string;
    accent: boolean;
}) {
    return (
        <div
            className={`flex flex-col items-center gap-2 p-4 rounded-lg ${accent ? "bg-emerald-400/[0.06] border border-emerald-400/10" : "bg-white/[0.02]"
                }`}
        >
            <span className="text-xl">{icon}</span>
            <span
                className={`text-xs font-medium ${accent ? "text-emerald-400/60" : "text-white/50"
                    }`}
            >
                {label}
            </span>
            <span className="text-[10px] text-white/20">{sublabel}</span>
        </div>
    );
}

function InfoCard({
    title,
    description,
}: {
    title: string;
    description: string;
}) {
    return (
        <div className="bg-white/[0.03] rounded-xl p-5 space-y-2 transition-all duration-300 hover:bg-white/[0.06]">
            <h3 className="text-sm font-medium text-white/60">{title}</h3>
            <p className="text-xs text-white/30 leading-relaxed">{description}</p>
        </div>
    );
}

function ProtocolCard({
    title,
    description,
}: {
    title: string;
    description: string;
}) {
    return (
        <div className="border-l-2 border-emerald-400/20 pl-4 space-y-1">
            <h3 className="text-sm font-medium text-white/60">{title}</h3>
            <p className="text-xs text-white/30 leading-relaxed">{description}</p>
        </div>
    );
}

function BadgeRow({
    badges,
}: {
    badges: { label: string; active: boolean }[];
}) {
    return (
        <div className="flex flex-wrap gap-2">
            {badges.map((b) => (
                <span
                    key={b.label}
                    className={`px-3 py-1 text-[11px] rounded-full ${b.active
                            ? "bg-emerald-400/10 text-emerald-400/60 border border-emerald-400/20"
                            : "bg-white/[0.03] text-white/20 border border-white/[0.06] line-through"
                        }`}
                >
                    {b.active ? "✓" : "✗"} {b.label}
                </span>
            ))}
        </div>
    );
}

/* ─── Inline SVG Icons ─── */

function MetaMaskIcon() {
    return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="6" width="20" height="14" rx="2" />
            <path d="M2 10h20" />
            <circle cx="16" cy="14" r="1.5" />
        </svg>
    );
}

function SignIcon() {
    return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 19l7-7 3 3-7 7-3-3z" />
            <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
            <path d="M2 2l7.586 7.586" />
            <circle cx="11" cy="11" r="2" />
        </svg>
    );
}

function TokenIcon() {
    return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            <circle cx="12" cy="16" r="1" />
        </svg>
    );
}
