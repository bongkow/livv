export const APP_NAME = "livv";

export const appConfig = {
  appName: APP_NAME,
  websocketUrl: "wss://ws.bongkow.com",
  authApiBaseUrl: "https://api.bongkow.com",
  authEndpoint: "/public/auth/get-token",
  tokenExpirationHour: 24,
  getSignMessage: (address: string) => {
    const localTime = new Date().toLocaleString();
    return `${address} wants to sign in with ${APP_NAME} at ${localTime}`;
  },
  /**
   * Static message signed once per wallet to derive the master E2E seed.
   * Must NEVER change — changing it invalidates all cached master seeds.
   */
  masterE2ESignMessage: [
    `${APP_NAME} End-to-End Encryption`,
    "",
    "Sign this message to generate your encryption master key.",
    "Your signature is used locally — it is never sent to any server.",
  ].join("\n"),
  getMasterSeedStorageKey: (address: string) =>
    `${APP_NAME}-e2e-master-${address.toLowerCase()}`,
  localStorageKeys: {
    auth: `${APP_NAME}-auth`,
  },

} as const;
