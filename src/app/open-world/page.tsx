"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useAuthStore } from "@/stores/useAuthStore";
import ConnectWalletButton from "@/components/ConnectWalletButton";
import AppLogo from "@/components/AppLogo";

const OpenWorldScene = dynamic(() => import("@/game/OpenWorldScene"), {
    ssr: false,
    loading: () => (
        <div className="flex h-full items-center justify-center text-white/40 text-sm">
            Loading world…
        </div>
    ),
});

export default function OpenWorldPage() {
    const isConnected = useAuthStore((s) => s.isConnected);
    const walletAddress = useAuthStore((s) => s.walletAddress);
    const validateSession = useAuthStore((s) => s.validateSession);
    const router = useRouter();

    useEffect(() => {
        const check = async () => {
            if (isConnected && !(await validateSession())) {
                router.push("/");
            }
        };
        check();
    }, [isConnected, validateSession, router]);

    if (!isConnected) {
        return (
            <div className="flex h-screen flex-col items-center justify-center gap-6 bg-black">
                <AppLogo size={40} />
                <p className="text-white/50 text-sm">Connect your wallet to enter the world</p>
                <ConnectWalletButton />
            </div>
        );
    }

    return (
        <div className="h-screen w-screen overflow-hidden bg-black">
            <OpenWorldScene walletAddress={walletAddress} />
        </div>
    );
}
