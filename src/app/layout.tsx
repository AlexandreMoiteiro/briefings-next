import type { Metadata } from "next";
import "./globals.css";
import "leaflet/dist/leaflet.css";
import { AppShell } from "@/components/app-shell";

export const metadata: Metadata = {
  title: "Briefings Next",
  description:
    "Flight briefing builder with NavLog, Performance, Mass & Balance, VFR Map and PDF generation.",
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
