import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Encrypted Chat",
  description:
    "Real-time end-to-end encrypted chat on livv. Messages are encrypted on your device and never stored — ephemeral by design.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
