/*
 * @Module: AppLogo
 * @Purpose: Renders the livv logo (face avatar SVG) beside the app name
 * @Logic: Loads the logo SVG from /logo.svg via an img tag
 * @Interfaces: default export AppLogo ({ size? })
 * @Constraints: Logo SVG must exist at public/logo.svg
 */
"use client";

interface AppLogoProps {
    size?: number;
}

export default function AppLogo({ size = 24 }: AppLogoProps) {
    return (
        <img
            src="/logo.svg"
            alt="livv logo"
            width={size}
            height={size}
            className="rounded-full shrink-0 ring-1 ring-white"
            style={{ width: size, height: size }}
        />
    );
}
