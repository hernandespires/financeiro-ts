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
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-cover bg-center bg-no-repeat bg-fixed min-h-screen text-white`}
        style={{
          backgroundImage: "url('/wallpaper.png')",
          backgroundColor: "#000000ff" // Cor de segurança caso a imagem demore 1 segundo para carregar
        }}
      >
        {/* Floating Header */}
        <div className="max-w-7xl mx-auto pt-6 px-4">
          <Header />
        </div>

        {/* Page Content */}
        <main className="max-w-7xl mx-auto px-4 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}