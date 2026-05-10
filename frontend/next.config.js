/** @type {import('next').NextConfig} */
const nextConfig = {
  // Evita que Next reinyecte `.next/types/**/*.ts` en tsconfig en cada build (tipado estricto de rutas).
  experimental: {
    typedRoutes: false,
  },
  images: {
    domains: ['localhost'],
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
  },
}

module.exports = nextConfig
