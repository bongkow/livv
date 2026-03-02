/*
 * @Module: LandingPage
 * @Purpose: Main landing page — tells visitors what the app is about
 * @Logic: Validates wallet session on mount, composes header, hero, features, footer
 * @Interfaces: default export LandingPage
 * @Constraints: No room listing here — rooms are accessed via /chat route
 */
"use client";

import { useEffect } from "react";
import Link from "next/link";
import ConnectWalletButton from "@/components/ConnectWalletButton";
import HeroSection from "@/components/HeroSection";
import FeatureGrid from "@/components/FeatureGrid";
import { useAuthStore } from "@/stores/useAuthStore";
import { appConfig } from "@/config/appConfig";

const TRUST_SIGNALS = [
  "end-to-end encrypted",
  "zero-knowledge server",
  "ephemeral messages",
] as const;

export default function LandingPage() {
  const isConnected = useAuthStore((s) => s.isConnected);
  const validateSession = useAuthStore((s) => s.validateSession);

  // Validate wallet connection + token on page load
  useEffect(() => {
    if (isConnected) {
      validateSession();
    }
  }, [isConnected, validateSession]);

  return (
    <div className="LandingPage flex min-h-screen flex-col bg-black">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-white/[0.08] backdrop-blur-md bg-black/50 px-5 py-4">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-light tracking-wide text-white/80">livv</h1>
          <span className="text-[10px] text-white/20 font-mono">v{appConfig.appVersion}</span>
        </div>
        <ConnectWalletButton />
      </header>

      {/* Hero */}
      <HeroSection />

      {/* Features */}
      <FeatureGrid />

      {/* Spacer to push footer down */}
      <div className="flex-1" />

      {/* Footer */}
      <footer className="border-t border-white/[0.08] backdrop-blur-md bg-black/50 px-5 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            {TRUST_SIGNALS.map((signal) => (
              <span
                key={signal}
                className="text-[11px] text-white/30 bg-white/[0.04] rounded-full px-3 py-1"
              >
                {signal}
              </span>
            ))}
          </div>
          <Link
            href="/encryption"
            className="text-[11px] text-white/30 hover:text-white/50 transition-colors"
          >
            encryption details →
          </Link>
        </div>
      </footer>
    </div>
  );
}
