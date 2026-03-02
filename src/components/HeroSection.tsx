/*
 * @Module: HeroSection
 * @Purpose: Landing page hero — headline, subtitle, and CTA button
 * @Logic: Checks auth state. If signed in, navigates to /rooms. If not, alerts user to connect wallet first.
 * @Interfaces: default export HeroSection
 * @Constraints: Reads isConnected from useAuthStore
 */
"use client";

import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/useAuthStore";

export default function HeroSection() {
    const isConnected = useAuthStore((s) => s.isConnected);
    const router = useRouter();

    const handleBrowseRooms = () => {
        if (isConnected) {
            router.push("/rooms");
        } else {
            alert(
                "To see the rooms, you need to sign in with your Ethereum wallet. It's completely free!"
            );
        }
    };

    return (
        <section className="HeroSection border-b border-white/[0.08] py-20 md:py-32 px-5">
            <div className="mx-auto max-w-2xl space-y-8 animate-fade-in-up">
                {/* Tagline */}
                <h2 className="text-4xl md:text-5xl font-light tracking-tight leading-tight bg-gradient-to-br from-white to-white/50 bg-clip-text text-transparent">
                    Private conversations.
                    <br />
                    No accounts. No logs.
                </h2>

                {/* Subtitle */}
                <p className="text-sm md:text-base text-white/50 leading-relaxed max-w-lg">
                    livv is end-to-end encrypted chat where your Ethereum wallet is your
                    only identity. Messages are encrypted on your device — the server is a
                    relay, not a reader.
                </p>

                {/* CTA */}
                <button
                    onClick={handleBrowseRooms}
                    className="border border-white/20 px-8 py-3 text-sm font-medium text-white hover:bg-white hover:text-black transition-all duration-200 rounded cursor-pointer"
                >
                    Browse Rooms →
                </button>
            </div>
        </section>
    );
}
