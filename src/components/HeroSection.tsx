"use client";

import Link from "next/link";

export default function HeroSection() {
    return (
        <section className="HeroSection border-b border-white/[0.08] py-16 md:py-24 px-5">
            <div className="mx-auto max-w-2xl space-y-6">
                {/* Tagline */}
                <h2 className="text-2xl md:text-3xl font-semibold tracking-tight text-white leading-tight">
                    Private conversations.
                    <br />
                    No accounts. No logs.
                </h2>

                {/* Subtitle */}
                <p className="text-sm md:text-base text-white/40 leading-relaxed max-w-lg">
                    livv is end-to-end encrypted chat where your Ethereum wallet is your
                    only identity. Messages are encrypted on your device — the server is a
                    relay, not a reader.
                </p>

                {/* CTA */}
                <Link
                    href="/encryption"
                    className="inline-block border border-white/20 px-5 py-2.5 text-xs text-white/50 hover:text-white hover:border-white/60 transition-all duration-200"
                >
                    How encryption works →
                </Link>
            </div>
        </section>
    );
}
