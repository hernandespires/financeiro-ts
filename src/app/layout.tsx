import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TS Financeiro",
  description: "Sistema Financeiro - Trajetória do Sucesso",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-black min-h-screen text-gray-200`}
      >
        {/* Floating Header */}
        <div className="max-w-7xl mx-auto pt-5 px-6">
          <Header />
        </div>

        {/* Page Content */}
        <main className="max-w-7xl mx-auto px-6 pt-5 pb-10">
          {children}
        </main>
      </body>
    </html>
  );
}