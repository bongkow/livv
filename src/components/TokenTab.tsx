/*
 * @Module: TokenTab
 * @Purpose: Token settings tab — configure longevity and view live countdown
 * @Logic: Reads JWT exp from auth store, runs 1s interval for countdown.
 *         Writes longevity preference to settings store.
 * @Interfaces: default export TokenTab
 * @Constraints: Longevity changes only apply on next sign-in
 */
"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuthStore } from "@/stores/useAuthStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { getTokenExpiry } from "@/utils/isTokenExpired";

// ─── Logic ───

function useTokenCountdown() {
    const jwt = useAuthStore((s) => s.jwt);
    const [remaining, setRemaining] = useState<string>("—");
    const [percentage, setPercentage] = useState(0);

    const tick = useCallback(() => {
        if (!jwt) {
            setRemaining("No token");
            setPercentage(0);
            return;
        }
        const info = getTokenExpiry(jwt);
        if (!info) {
            setRemaining("Unknown");
            setPercentage(0);
            return;
        }

        const nowSec = Math.floor(Date.now() / 1000);
        const left = info.expiresAt - nowSec;
        const total = info.expiresAt - info.issuedAt;

        if (left <= 0) {
            setRemaining("Expired");
            setPercentage(0);
            return;
        }

        const h = Math.floor(left / 3600);
        const m = Math.floor((left % 3600) / 60);
        const s = left % 60;
        setRemaining(
            `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
        );
        setPercentage(total > 0 ? (left / total) * 100 : 0);
    }, [jwt]);

    useEffect(() => {
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, [tick]);

    return { remaining, percentage };
}

// ─── UI ───

export default function TokenTab() {
    const tokenExpirationHour = useSettingsStore((s) => s.tokenExpirationHour);
    const setTokenExpirationHour = useSettingsStore((s) => s.setTokenExpirationHour);
    const { remaining, percentage } = useTokenCountdown();

    return (
        <div className="flex flex-col gap-6">
            {/* Current token status */}
            <section>
                <h3 className="text-[11px] text-white/30 uppercase tracking-widest mb-3">
                    Current Token
                </h3>
                <div className="bg-white/[0.03] border border-white/[0.08] rounded-lg p-4">
                    <div className="flex items-baseline justify-between mb-2">
                        <span className="text-xs text-white/40">Time remaining</span>
                        <span
                            className={`text-lg font-mono font-medium tracking-wider ${remaining === "Expired"
                                    ? "text-red-400"
                                    : "text-white/80"
                                }`}
                        >
                            {remaining}
                        </span>
                    </div>
                    {/* Progress bar */}
                    <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
                        <div
                            className="h-full rounded-full transition-all duration-1000 ease-linear"
                            style={{
                                width: `${percentage}%`,
                                background:
                                    percentage > 20
                                        ? "linear-gradient(90deg, #22c55e, #4ade80)"
                                        : percentage > 5
                                            ? "linear-gradient(90deg, #eab308, #facc15)"
                                            : "linear-gradient(90deg, #ef4444, #f87171)",
                            }}
                        />
                    </div>
                </div>
            </section>

            {/* Longevity setting */}
            <section>
                <h3 className="text-[11px] text-white/30 uppercase tracking-widest mb-3">
                    Token Longevity
                </h3>
                <div className="bg-white/[0.03] border border-white/[0.08] rounded-lg p-4">
                    <div className="flex items-center gap-4 mb-3">
                        <input
                            type="range"
                            min={1}
                            max={168}
                            value={tokenExpirationHour}
                            onChange={(e) =>
                                setTokenExpirationHour(Number(e.target.value))
                            }
                            className="flex-1 h-1 appearance-none bg-white/10 rounded-full cursor-pointer
                                       [&::-webkit-slider-thumb]:appearance-none
                                       [&::-webkit-slider-thumb]:w-3
                                       [&::-webkit-slider-thumb]:h-3
                                       [&::-webkit-slider-thumb]:rounded-full
                                       [&::-webkit-slider-thumb]:bg-white
                                       [&::-webkit-slider-thumb]:shadow-[0_0_6px_rgba(255,255,255,0.4)]"
                        />
                        <span className="text-sm font-mono text-white/70 w-14 text-right">
                            {tokenExpirationHour}h
                        </span>
                    </div>
                    <p className="text-[11px] text-white/25">
                        Takes effect on next sign-in · Range: 1h – 168h (7 days)
                    </p>
                </div>
            </section>
        </div>
    );
}
