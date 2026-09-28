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
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "BrandForge - Chat-first studio for founders",
    description:
      "Describe your project in a chat, get a human-vetted proposal, fund it with admin-verified crypto escrow, and approve every milestone before payment is released.",
    url: "https://brandforge.gg",
    siteName: "BrandForge",
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "BrandForge - Describe it. Humans build it.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "BrandForge - Chat-first studio for founders",
    description:
      "Describe your project in a chat, get a human-vetted proposal, fund it with admin-verified crypto escrow.",
    images: ["/twitter-card.png"],
  },
  themeColor: "#111417",
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