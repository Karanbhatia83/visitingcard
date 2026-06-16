/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Server actions handle uploads as base64 JSON; raise the body limit for card images.
  experimental: {
    serverActions: {
      bodySizeLimit: '8mb',
    },
  },
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
};

module.exports = nextConfig;
