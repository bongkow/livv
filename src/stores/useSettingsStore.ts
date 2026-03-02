/*
 * @Module: useSettingsStore
 * @Purpose: Persisted peer-specific settings (token longevity, future tabs)
 * @Logic: Zustand store with persist middleware to localStorage
 * @Interfaces: useSettingsStore — tokenExpirationHour, setTokenExpirationHour
 * @Constraints: Values take effect on next sign-in, not retroactively
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SettingsState {
    /** How long the auth token should last (in hours). Default 24. */
    tokenExpirationHour: number;
}

interface SettingsActions {
    setTokenExpirationHour: (hours: number) => void;
}

type SettingsStore = SettingsState & SettingsActions;

export const useSettingsStore = create<SettingsStore>()(
    persist(
        (set) => ({
            tokenExpirationHour: 24,
            setTokenExpirationHour: (hours: number) =>
                set({ tokenExpirationHour: Math.max(1, Math.min(168, hours)) }),
        }),
        { name: "livv-settings" }
    )
);
