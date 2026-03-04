import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Chat Rooms — Browse Encrypted Rooms",
  description:
    "Browse and join end-to-end encrypted chat rooms on livv. Each room uses unique derived keys for secure, ephemeral group conversations.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function RoomsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
