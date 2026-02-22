export const APP_NAME = "livv";

export const appConfig = {
  appName: APP_NAME,
  websocketUrl: "wss://ws.bongkow.com",
  authApiBaseUrl: "https://api.bongkow.com",
  authEndpoint: "/public/auth/get-token",
  tokenExpirationHour: 24,
  getSignMessage: () => {
    const localTime = new Date().toLocaleString();
    return `I want to sign in with ${APP_NAME} at ${localTime}`;
  },
  localStorageKeys: {
    auth: `${APP_NAME}-auth`,
  },

} as const;
