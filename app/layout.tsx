import type { Metadata } from "next";
import { Geist, Geist_Mono, Orbitron } from "next/font/google";
import type { ReactNode } from "react";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { AuthDisplayPreHydrationHead } from "@/components/auth/auth-display";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getAppOrigin } from "@/lib/app-origin";
import { themeInitScript } from "@/lib/theme";
import "./globals.css";

const title = "harpy";
const description = "Chat with harpy, your own AI agent.";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

const orbitron = Orbitron({
  subsets: ["latin"],
  variable: "--font-orbitron",
  weight: ["500", "700", "900"],
});

export const metadata: Metadata = {
  metadataBase: new URL(getAppOrigin()),
  title,
  description,
  applicationName: title,
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: ["/icon.svg"],
    apple: [{ url: "/apple-icon", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title,
    description,
    siteName: title,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html
      className={`${geistSans.variable} ${geistMono.variable} ${orbitron.variable}`}
      lang="en"
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} id="theme-init" />
        <AuthDisplayPreHydrationHead />
      </head>
      <body className={`${geistSans.className} antialiased`}>
        <ThemeProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </ThemeProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
