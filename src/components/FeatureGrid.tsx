"use client";

const FEATURES = [
    {
        icon: <LockIcon />,
        title: "End-to-End Encrypted",
        description:
            "Signal-level protocols — the server never sees your messages.",
    },
    {
        icon: <WalletIcon />,
        title: "Wallet-Based Identity",
        description:
            "Sign in with MetaMask — no email, no password, no personal data.",
    },
    {
        icon: <EphemeralIcon />,
        title: "Ephemeral by Design",
        description:
            "Messages live in memory only — close the tab, they're gone.",
    },
] as const;

export default function FeatureGrid() {
    return (
        <section className="FeatureGrid px-5 py-10">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-px">
                {FEATURES.map((feature) => (
                    <div
                        key={feature.title}
                        className="group border border-white/[0.08] p-6 space-y-3 transition-colors duration-200 hover:border-white/20"
                    >
                        <div className="text-white/30 group-hover:text-white/50 transition-colors duration-200">
                            {feature.icon}
                        </div>
                        <h3 className="text-sm font-medium text-white/70">
                            {feature.title}
                        </h3>
                        <p className="text-xs text-white/30 leading-relaxed">
                            {feature.description}
                        </p>
                    </div>
                ))}
            </div>
        </section>
    );
}

/* ─── Inline SVG Icons (no external libs) ─── */

function LockIcon() {
    return (
        <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
    );
}

function WalletIcon() {
    return (
        <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <rect x="2" y="6" width="20" height="14" rx="2" />
            <path d="M2 10h20" />
            <circle cx="16" cy="14" r="1.5" />
        </svg>
    );
}

function EphemeralIcon() {
    return (
        <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10" />
            <path d="M12 6v6l4 2" />
            <path d="M18 15l3 3" />
            <path d="M21 15l-3 3" />
        </svg>
    );
}
