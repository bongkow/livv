/*
 * @Module: AvatarDetailPanel
 * @Purpose: Overlay panel showing all ETH-address-derived avatar features + USDC balance
 * @Logic: Derives features from address, fetches USDC balance on mount.
 *         Renders as a centered glassmorphic overlay on top of the 3D scene.
 * @Interfaces: default export AvatarDetailPanel ({ address, onClose })
 * @Constraints: Client-only. Must be used inside an open-world context.
 */
"use client";

import { useEffect, useState } from "react";
import { deriveAvatarFeatures } from "@/game/deriveAvatarFeatures";
import type { AvatarFeatures } from "@/game/deriveAvatarFeatures";
import { fetchUsdcBalance } from "@/game/fetchUsdcBalance";
import { truncateAddress } from "@/utils/truncateAddress";

interface AvatarDetailPanelProps {
    address: string;
    onClose: () => void;
}

// ─── Color swatch ───

function ColorSwatch({ hex, label }: { hex: string; label: string }) {
    return (
        <div className="flex items-center gap-2">
            <div
                className="h-4 w-4 rounded-full border border-white/20"
                style={{ backgroundColor: hex }}
            />
            <span className="text-white/70 text-xs">{label}</span>
        </div>
    );
}

// ─── Feature row ───

function FeatureRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between py-1 border-b border-white/[0.06] last:border-0">
            <span className="text-white/40 text-xs">{label}</span>
            <span className="text-white text-xs font-medium">{value}</span>
        </div>
    );
}

// ─── Main panel ───

export default function AvatarDetailPanel({ address, onClose }: AvatarDetailPanelProps) {
    const [features, setFeatures] = useState<AvatarFeatures | null>(null);
    const [balance, setBalance] = useState<string>("loading…");

    useEffect(() => {
        setFeatures(deriveAvatarFeatures(address));
        fetchUsdcBalance(address).then(setBalance);
    }, [address]);

    if (!features) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className="w-80 rounded-xl border border-white/10 bg-black/80 p-5 backdrop-blur-md shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-white">Avatar Details</h3>
                    <button
                        onClick={onClose}
                        className="text-white/40 hover:text-white text-lg leading-none cursor-pointer"
                    >
                        ✕
                    </button>
                </div>

                {/* Address */}
                <div className="rounded-lg bg-white/[0.04] px-3 py-2 mb-4 font-mono text-xs text-white/60 text-center">
                    {truncateAddress(address)}
                </div>

                {/* USDC Balance */}
                <div className="rounded-lg bg-white/[0.04] px-3 py-2.5 mb-4 flex items-center justify-between">
                    <span className="text-white/40 text-xs">USDC (Base)</span>
                    <span className="text-white font-medium text-sm">${balance}</span>
                </div>

                {/* Features */}
                <div className="space-y-0">
                    <FeatureRow label="Gender" value={features.gender} />
                    <FeatureRow label="Height" value={`${features.heightCm} cm`} />
                    <FeatureRow label="Eye Size" value={features.eyeSize} />
                    <FeatureRow label="Nose" value={features.noseSize} />
                    <FeatureRow label="Mouth" value={features.mouthShape} />
                    <FeatureRow label="Brow Shape" value={features.browShape} />
                    <FeatureRow label="Brow Thickness" value={features.browThickness} />
                    <FeatureRow label="Brow Width" value={features.browWidth} />
                    <FeatureRow label="Shirt Hue" value={`${features.shirtHue}°`} />
                </div>

                {/* Color swatches */}
                <div className="mt-4 flex items-center gap-4">
                    <ColorSwatch hex={features.skinTone} label="Skin" />
                    <ColorSwatch hex={features.hairColor} label="Hair" />
                    <ColorSwatch hex={features.eyeColor} label="Eyes" />
                </div>
            </div>
        </div>
    );
}
