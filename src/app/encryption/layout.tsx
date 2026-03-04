import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "How livv Encryption Works — E2E Security Architecture",
  description:
    "Learn how livv protects your messages with end-to-end encryption, Double Ratchet protocol, X3DH key exchange, and zero-knowledge server architecture. All encryption runs client-side via Web Crypto API.",
  keywords: [
    "end-to-end encryption explained",
    "Double Ratchet protocol",
    "X3DH key exchange",
    "zero-knowledge architecture",
    "Web Crypto API encryption",
    "ECDH P-256",
    "AES-256-GCM",
    "forward secrecy",
    "Signal protocol",
    "client-side encryption",
  ],
  openGraph: {
    title: "How livv Encryption Works — E2E Security Architecture",
    description:
      "Deep dive into livv's encryption: Double Ratchet, X3DH handshake, Sender Keys for groups, and ephemeral message storage. Zero-knowledge by design.",
    url: "/encryption",
  },
  twitter: {
    title: "How livv Encryption Works — E2E Security Architecture",
    description:
      "Deep dive into livv's encryption: Double Ratchet, X3DH handshake, Sender Keys for groups, and ephemeral message storage.",
  },
  alternates: {
    canonical: "/encryption",
  },
};

export default function EncryptionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
