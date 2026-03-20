import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Open World — livv",
    robots: { index: false, follow: false },
};

export default function OpenWorldLayout({ children }: { children: React.ReactNode }) {
    return children;
}
