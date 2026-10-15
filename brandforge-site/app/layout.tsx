import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Inter, Fraunces } from "next/font/google";
import { LoginProvider } from "@/components/login-dialog";
import { CookieConsent } from "@/components/cookie-consent";
import { JsonLd } from "@/components/json-ld";
import { SITE_URL, ogImageUrl, siteGraph } from "@/lib/seo";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
// The soft axis rounds the serif's corners: warmer, more human headings.
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", axes: ["SOFT", "opsz"] });

const DESCRIPTION = 'Describe an idea, paste a URL or drop a file. AI researches, plans and creates; your team and vetted specialists finish it in the same chat.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'BrandForge: AI and people, one workspace', template: '%s' },
  description: DESCRIPTION,
  applicationName: 'BrandForge',
  authors: [{ name: 'BrandForge', url: SITE_URL }],
  creator: 'BrandForge',
  publisher: 'BrandForge',
  keywords: ['AI workspace', 'carousel and ad maker', 'content calendar', 'social media posts', 'freelance marketplace', 'hire designers and developers', 'escrow payments'],
  category: 'business',
  formatDetection: { telephone: false, email: false, address: false },
  alternates: { canonical: '/' },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1, 'max-video-preview': -1 } },
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
    other: { 'msvalidate.01': process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION ?? '41DDC3CE50460F1A80E82EB137A5AD50' },
  },
  icons: {
    icon: [
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    title: 'BrandForge: AI and people, one workspace',
    description: 'Make every kind of message and publish it. Trade products, services and requests. AI drafts in seconds; people finish the job. Free to start.',
    url: SITE_URL,
    siteName: 'BrandForge',
    type: 'website',
    locale: 'en_US',
    images: [{ url: ogImageUrl('AI and people, one workspace', 'Make it. Publish it. Trade it.'), width: 1200, height: 630, alt: 'BrandForge: describe it, AI drafts it, people ship it.' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'BrandForge: AI and people, one workspace',
    description: 'Make every kind of message and publish it. Trade products, services and requests. AI drafts in seconds; people finish the job. Free to start.',
    images: [ogImageUrl('AI and people, one workspace', 'Make it. Publish it. Trade it.')],
  },
};

export const viewport: Viewport = {
  themeColor: "#fbfaf8",
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
            __html: `(function(){try{var t=localStorage.getItem('brandforge:theme');if(t==='light')t='mono';if(t==='original')t='forge';if(t==='forge'||t==='crystal'||t==='mono'){document.documentElement.dataset.theme=t;}}catch(e){}try{if(localStorage.getItem('brandforge:rail-collapsed')==='1')document.documentElement.dataset.rail='collapsed';}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <JsonLd data={siteGraph()} />
        <LoginProvider>{children}</LoginProvider>
        <CookieConsent />
      </body>
    </html>
  );
}