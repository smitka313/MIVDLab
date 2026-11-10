import type { Metadata, Viewport } from "next";
import "./globals.css";
import { RootProviders } from "@/components/providers/root-providers";

export const metadata: Metadata = {
  title: { default: "ClassPulse", template: "%s · ClassPulse" },
  description: "Better classroom management. Stronger student support. Less paperwork.",
  robots: { index: false, follow: false },
  applicationName: "ClassPulse",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/brand/classpulse-app-icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  appleWebApp: { capable: true, title: "ClassPulse", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
  other: { "msapplication-TileColor": "#001a40", "mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f8fc" },
    { media: "(prefers-color-scheme: dark)", color: "#050d1f" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className="h-full antialiased">
      <body className="min-h-full">
        <RootProviders>{children}</RootProviders>
      </body>
    </html>
  );
}
