import type { Metadata } from "next";
import "./globals.css";
import "leaflet/dist/leaflet.css";
import { AppShell } from "@/components/app-shell";

export const metadata: Metadata = {
  title: "Briefings",
  description:
    "Flight briefing builder with NavLog, Performance, Mass & Balance, VFR Map and PDF generation.",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icon.png", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: [{ url: "/apple-icon.png", type: "image/png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
