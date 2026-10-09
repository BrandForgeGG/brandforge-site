import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Inter, Fraunces } from "next/font/google";
import { LoginProvider } from "@/components/login-dialog";
import { Analytics } from "@vercel/analytics/next";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://brandforge.gg"),
  title: "BrandForge: AI and people, one workspace",
  description:
    "Describe an idea, paste a URL or drop a file. AI researches, plans and creates; your team and vetted specialists finish it in the same chat.",
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "BrandForge: AI and people, one workspace",
    description:
      "Plans, ads and swipeable carousels in one chat, with your team and vetted specialists to finish the job. Free to start.",
    url: "https://brandforge.gg",
    siteName: "BrandForge",
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "BrandForge: describe it, AI drafts it, people ship it.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "BrandForge: AI and people, one workspace",
    description:
      "Plans, ads and swipeable carousels in one chat, with your team and vetted specialists to finish the job. Free to start.",
    images: ["/twitter-card.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#0f0e0d",
  // Lets env(safe-area-inset-*) work, so footers clear the iPhone home indicator.
  viewportFit: "cover",
  // The on-screen keyboard shrinks the page instead of covering the composer (Chrome/Android;
  // iOS already resizes the visual viewport).
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable}`} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('brandforge:theme');if(t==='light')t='mono';if(t==='original')t='forge';if(t==='crystal'||t==='mono'){document.documentElement.dataset.theme=t;}}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <LoginProvider>{children}</LoginProvider>
        <Analytics />
      </body>
    </html>
  );
}