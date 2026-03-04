import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
});

const SITE_URL = "https://livv.bongkow.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "livv — End-to-End Encrypted Chat Powered by Ethereum",
    template: "%s | livv",
  },
  description:
    "Secure, ephemeral chat rooms with end-to-end encryption and zero-knowledge architecture. Connect with your Ethereum wallet — no email, no password, no data stored.",
  keywords: [
    "encrypted chat",
    "end-to-end encryption",
    "Ethereum chat",
    "Web3 messaging",
    "zero-knowledge chat",
    "ephemeral messaging",
    "private chat rooms",
    "MetaMask chat",
    "decentralized messaging",
    "secure communication",
    "crypto chat",
    "blockchain chat",
  ],
  authors: [{ name: "livv" }],
  creator: "livv",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    siteName: "livv",
    title: "livv — End-to-End Encrypted Chat Powered by Ethereum",
    description:
      "Secure, ephemeral chat rooms with end-to-end encryption and zero-knowledge architecture. Connect with your Ethereum wallet — no signup required.",
  },
  twitter: {
    card: "summary_large_image",
    title: "livv — End-to-End Encrypted Chat Powered by Ethereum",
    description:
      "Secure, ephemeral chat rooms with end-to-end encryption and zero-knowledge architecture. Connect with your Ethereum wallet — no signup required.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: SITE_URL,
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "livv",
  url: SITE_URL,
  description:
    "End-to-end encrypted chat rooms powered by Ethereum. Zero-knowledge server, ephemeral messages, no signup required.",
  applicationCategory: "CommunicationApplication",
  operatingSystem: "Web",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  featureList: [
    "End-to-end encryption",
    "Ethereum wallet authentication",
    "Zero-knowledge server",
    "Ephemeral messages",
    "Double Ratchet protocol",
    "Forward secrecy",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans antialiased bg-black text-white`}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {children}
      </body>
    </html>
  );
}
