import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 1. Desativa source maps em produção (previne engenharia reversa do frontend)
  productionBrowserSourceMaps: false,

  // 2. Oculta que o site foi feito em Next.js (dificulta ataques automatizados)
  poweredByHeader: false,

  // 3. HTTP Security Headers em todas as rotas
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            // Proteção contra XSS
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          {
            // Bloqueia abertura em <iframe> de outros domínios (Clickjacking)
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            // Impede MIME-type sniffing
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            // Controla informações enviadas ao navegar para links externos
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            // Restringe acesso a câmera, microfone e geolocalização
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
