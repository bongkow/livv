/**
 * Decode a JWT payload without verification (client-side only).
 * We only use this to check the `exp` claim for token freshness.
 * Actual cryptographic verification happens server-side.
 */

interface JwtPayload {
    exp?: number;
    iat?: number;
    address?: string;
    application?: string;
    [key: string]: unknown;
}

/**
 * Check if a JWT token is expired or malformed.
 * Returns true if the token should NOT be used.
 */
export function isTokenExpired(token: string): boolean {
    if (!token) return true;

    try {
        const payload = decodeJwtPayload(token);
        if (!payload.exp) return true;

        // Compare against current time with a 30-second buffer
        const nowInSeconds = Math.floor(Date.now() / 1000);
        return nowInSeconds >= payload.exp - 30;
    } catch {
        return true;
    }
}

/**
 * Decode the payload section of a JWT (base64url → JSON).
 */
export function decodeJwtPayload(token: string): JwtPayload {
    const parts = token.split(".");
    if (parts.length !== 3) {
        throw new Error("Invalid JWT format");
    }

    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
        atob(base64)
            .split("")
            .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
            .join("")
    );

    return JSON.parse(jsonPayload);
}

/**
 * Extract the wallet address embedded in a JWT token.
 * Returns null if the token is malformed or has no address claim.
 */
export function getTokenAddress(token: string): string | null {
    try {
        const payload = decodeJwtPayload(token);
        return payload.address?.toLowerCase() ?? null;
    } catch {
        return null;
    }
}
