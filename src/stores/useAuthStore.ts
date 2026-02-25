import { create } from "zustand";
import { persist } from "zustand/middleware";
import { BrowserProvider } from "ethers";
import { APP_NAME, appConfig } from "@/config/appConfig";
import { isTokenExpired, getTokenAddress } from "@/utils/isTokenExpired";

interface AuthState {
    walletAddress: string;
    jwt: string;
    isConnected: boolean;
    isAuthenticating: boolean;
    errorMessage: string;
}

interface AuthActions {
    connectAndSignIn: () => Promise<void>;
    signOut: () => void;
    setErrorMessage: (message: string) => void;
    /** Validates wallet connection + token address match. Signs out if invalid. */
    validateSession: () => Promise<boolean>;
}

type AuthStore = AuthState & AuthActions;

export const useAuthStore = create<AuthStore>()(
    persist(
        (set, get) => ({
            walletAddress: "",
            jwt: "",
            isConnected: false,
            isAuthenticating: false,
            errorMessage: "",

            setErrorMessage: (message: string) => set({ errorMessage: message }),

            connectAndSignIn: async () => {
                const ethereum = (window as unknown as { ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown>; isMetaMask?: boolean } }).ethereum;
                if (!ethereum) {
                    set({ errorMessage: "Please install MetaMask or another Ethereum wallet." });
                    return;
                }

                set({ isAuthenticating: true, errorMessage: "" });

                try {
                    // Request wallet connection
                    const accounts = (await ethereum.request({
                        method: "eth_requestAccounts",
                    })) as string[];
                    const address = accounts[0];

                    // Create message to sign
                    const message = appConfig.getSignMessage(address);
                    const provider = new BrowserProvider(ethereum as never);
                    const signer = await provider.getSigner();
                    const signature = await signer.signMessage(message);

                    // Get JWT from API
                    const response = await fetch(
                        `${appConfig.authApiBaseUrl}${appConfig.authEndpoint}`,
                        {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ address, signature, message, application: APP_NAME, expirationInHour: appConfig.tokenExpirationHour }),
                        }
                    );

                    if (!response.ok) {
                        throw new Error(`Auth failed: ${response.statusText}`);
                    }

                    const data = await response.json();
                    const jwt = data.token || data.jwt || data.accessToken;

                    if (!jwt) {
                        throw new Error("No token received from auth API");
                    }

                    // Derive master E2E seed if not already cached for this wallet.
                    // The message is static, so the same wallet always produces
                    // the same seed — safe to persist in localStorage forever.
                    const seedKey = appConfig.getMasterSeedStorageKey(address);
                    if (!localStorage.getItem(seedKey)) {
                        const e2eSignature = await signer.signMessage(
                            appConfig.masterE2ESignMessage
                        );
                        const seedBuffer = await crypto.subtle.digest(
                            "SHA-256",
                            new TextEncoder().encode(e2eSignature)
                        );
                        const seedHex = Array.from(new Uint8Array(seedBuffer))
                            .map((b) => b.toString(16).padStart(2, "0"))
                            .join("");
                        localStorage.setItem(seedKey, seedHex);
                    }

                    set({
                        walletAddress: address,
                        jwt,
                        isConnected: true,
                        isAuthenticating: false,
                    });
                } catch (error: unknown) {
                    const message =
                        error instanceof Error ? error.message : "Failed to connect wallet";
                    set({
                        isAuthenticating: false,
                        errorMessage: message,
                    });
                }
            },

            signOut: () => {
                set({
                    walletAddress: "",
                    jwt: "",
                    isConnected: false,
                    isAuthenticating: false,
                    errorMessage: "",
                });
            },

            validateSession: async () => {
                const { jwt, isConnected, signOut } = get();
                if (!isConnected || !jwt) return false;

                // 1. Check token expiry
                if (isTokenExpired(jwt)) {
                    signOut();
                    set({ errorMessage: "Session expired. Please sign in again." });
                    return false;
                }

                // 2. Check if wallet is still connected in MetaMask
                const ethereum = (
                    window as unknown as {
                        ethereum?: {
                            request: (args: { method: string }) => Promise<unknown>;
                        };
                    }
                ).ethereum;

                if (!ethereum) {
                    signOut();
                    set({ errorMessage: "Wallet not available. Please sign in again." });
                    return false;
                }

                try {
                    const accounts = (await ethereum.request({
                        method: "eth_accounts",
                    })) as string[];

                    if (!accounts.length) {
                        signOut();
                        set({ errorMessage: "Wallet disconnected. Please sign in again." });
                        return false;
                    }

                    // 3. Check if JWT address matches connected wallet
                    const tokenAddress = getTokenAddress(jwt);
                    const connectedAddress = accounts[0].toLowerCase();

                    if (!tokenAddress || tokenAddress !== connectedAddress) {
                        signOut();
                        set({ errorMessage: "Wallet address changed. Please sign in again." });
                        return false;
                    }
                } catch {
                    signOut();
                    set({ errorMessage: "Failed to verify wallet. Please sign in again." });
                    return false;
                }

                return true;
            },
        }),
        {
            name: appConfig.localStorageKeys.auth,
            partialize: (state) => ({
                walletAddress: state.walletAddress,
                jwt: state.jwt,
                isConnected: state.isConnected,
            }),
        }
    )
);
