/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Server actions handle uploads as base64 JSON; raise the body limit for card images.
  experimental: {
    serverActions: {
      bodySizeLimit: '8mb',
    },
    // Load youtubei.js from node_modules at runtime instead of bundling it
    // (it is ESM-only and ships platform-specific entry points).
    serverComponentsExternalPackages: ['youtubei.js'],
  },
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
};

module.exports = nextConfig;
