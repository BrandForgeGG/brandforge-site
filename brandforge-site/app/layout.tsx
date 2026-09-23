import "./globals.css";
import type { Metadata } from "next";
import { Inter, Fraunces } from "next/font/google";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://brandforge.gg"),
  title: "BrandForge - Chat-first studio for founders",
  description:
    "Describe your project in a chat, get a human-vetted proposal, fund it with admin-verified crypto escrow, and approve every milestone before payment is released.",
  openGraph: {
    title: "BrandForge - Chat-first studio for founders",
    description:
      "Describe your project in a chat, get a human-vetted proposal, fund it with admin-verified crypto escrow, and approve every milestone before payment is released.",
    url: "https://brandforge.gg",
    siteName: "BrandForge",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable}`}>
      <body>{children}</body>
    </html>
  );
}