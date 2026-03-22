/*
 * @Module: HeroSection
 * @Purpose: Landing page hero — headline, subtitle, CTA button, and signed-in avatar
 * @Logic: Checks auth state. If signed in, shows full-body avatar derived from
 *         the peer's Ethereum address and navigates to /rooms on CTA click.
 *         If not, alerts user to connect wallet first.
 * @Interfaces: default export HeroSection
 * @Constraints: Reads isConnected + walletAddress from useAuthStore
 */
"use client";

import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/useAuthStore";
import dynamic from "next/dynamic";

const Avatar3D = dynamic(() => import("@/components/Avatar3D"), {
    ssr: false,
    loading: () => (
        <div className="flex items-center justify-center" style={{ width: 220, height: 220 }}>
            <span className="text-white/20 text-xs">Loading…</span>
        </div>
    ),
});
import { truncateAddress } from "@/utils/truncateAddress";

export default function HeroSection() {
    const isConnected = useAuthStore((s) => s.isConnected);
    const walletAddress = useAuthStore((s) => s.walletAddress);
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
            <div className="mx-auto max-w-2xl animate-fade-in-up">
                <div className="flex items-center gap-10 md:gap-16">
                    {/* Text content */}
                    <div className="space-y-8 flex-1">
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

                    {/* Avatar — appears when peer signs in */}
                    {isConnected && walletAddress && (
                        <div className="hidden sm:flex flex-col items-center gap-3 animate-fade-in-up">
                            <div className="rounded-full bg-white/[0.04] p-4 ring-1 ring-white/[0.08]">
                                <Avatar3D address={walletAddress} size={220} />
                            </div>
                            <span className="text-xs text-white/30 font-mono">
                                {truncateAddress(walletAddress)}
                            </span>
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}
