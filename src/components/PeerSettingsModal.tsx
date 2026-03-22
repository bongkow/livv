/*
 * @Module: PeerSettingsModal
 * @Purpose: Tabbed modal for peer-specific settings, with left avatar panel
 * @Logic: Renders backdrop + centered panel. Left 1/4 shows large face avatar.
 *         Right 3/4 holds tab bar and active tab content.
 * @Interfaces: default export PeerSettingsModal ({ isOpen, onClose })
 * @Constraints: Tab content components must be self-contained
 */
"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useAuthStore } from "@/stores/useAuthStore";
import { truncateAddress } from "@/utils/truncateAddress";
import dynamic from "next/dynamic";

const Avatar3D = dynamic(() => import("@/components/Avatar3D"), {
    ssr: false,
    loading: () => (
        <div className="flex items-center justify-center" style={{ width: 160, height: 160 }}>
            <span className="text-white/20 text-xs">Loading…</span>
        </div>
    ),
});
import TokenTab from "./TokenTab";

// ─── Tab registry (extensible) ───

interface TabDef {
    id: string;
    label: string;
    content: React.ReactNode;
}

// ─── Logic ───

function useTabs(): TabDef[] {
    return [{ id: "token", label: "Token", content: <TokenTab /> }];
}

// ─── UI ───

interface PeerSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function PeerSettingsModal({
    isOpen,
    onClose,
}: PeerSettingsModalProps) {
    const walletAddress = useAuthStore((s) => s.walletAddress);
    const tabs = useTabs();
    const [activeTab, setActiveTab] = useState(tabs[0].id);
    const current = tabs.find((t) => t.id === activeTab) ?? tabs[0];
    const [mounted, setMounted] = useState(false);

    useEffect(() => setMounted(true), []);

    if (!isOpen || !mounted) return null;

    return createPortal(
        <div
            style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 9999,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
            }}
            onClick={onClose}
        >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

            {/* Panel */}
            <div
                className="relative flex w-full max-w-lg rounded-xl border border-white/[0.08] bg-[#0a0a0a] shadow-2xl overflow-hidden"
                style={{ minHeight: 340 }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Left avatar column — 1/4 width */}
                <div className="flex flex-col items-center justify-center gap-3 w-1/4 bg-white/[0.02] border-r border-white/[0.08] py-8 px-3">
                    <Avatar3D address={walletAddress} size={200} />
                    <span className="text-[10px] text-white/30 font-mono text-center break-all leading-relaxed">
                        {truncateAddress(walletAddress)}
                    </span>
                </div>

                {/* Right content column — 3/4 width */}
                <div className="flex flex-col flex-1 min-w-0">
                    {/* Header with tabs + close */}
                    <div className="flex items-center justify-between border-b border-white/[0.08] px-4">
                        <div className="flex gap-0">
                            {tabs.map((tab) => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`px-4 py-3 text-xs font-medium transition-colors relative ${activeTab === tab.id
                                        ? "text-white/80"
                                        : "text-white/30 hover:text-white/50"
                                        }`}
                                >
                                    {tab.label}
                                    {activeTab === tab.id && (
                                        <span className="absolute bottom-0 left-2 right-2 h-px bg-white/40" />
                                    )}
                                </button>
                            ))}
                        </div>
                        <button
                            onClick={onClose}
                            className="text-white/20 hover:text-white/60 transition-colors text-lg leading-none p-1"
                            aria-label="Close settings"
                        >
                            ✕
                        </button>
                    </div>

                    {/* Tab content */}
                    <div className="flex-1 overflow-y-auto p-4">
                        {current.content}
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
