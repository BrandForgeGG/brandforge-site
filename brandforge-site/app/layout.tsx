import "./globals.css";

export const metadata = {
  title: "BrandForge - Execution platform for founders",
  description: "Start a project, collaborate with whitelisted specialists, and bring your idea to life.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}