/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@gluconimbus/types", "@gluconimbus/validation"],
};

export default nextConfig;
