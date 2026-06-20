import type { Metadata } from "next";
import { Inter, Orbitron, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const orbitron = Orbitron({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["600", "800", "900"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://lethe.edycu.dev"),
  title: "Lethe — Delete me from the internet. Then delete the agent too.",
  description: "Autonomous right-to-erasure (GDPR Art. 17 / CCPA) agent coordinator powered by Terminal 3 Secure TEE Enclaves.",
  icons: {
    icon: "/icon.svg",
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "Lethe",
    statusBarStyle: "black-translucent",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
  openGraph: {
    title: "Lethe — Delete me from the internet. Then delete the agent too.",
    description: "Autonomous right-to-erasure (GDPR Art. 17 / CCPA) agent coordinator powered by Terminal 3 Secure TEE Enclaves.",
    url: "https://lethe.edycu.dev",
    siteName: "Lethe",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Lethe — Autonomous Right-to-Erasure Agent",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Lethe — Delete me from the internet. Then delete the agent too.",
    description: "Autonomous right-to-erasure (GDPR Art. 17 / CCPA) agent coordinator powered by Terminal 3 Secure TEE Enclaves.",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${orbitron.variable} ${jetbrainsMono.variable} h-full antialiased dark`}
    >
      <body className="min-h-full bg-[#02040a] bg-grid-mesh text-slate-100 font-sans flex flex-col">
        {children}
      </body>
    </html>
  );
}
