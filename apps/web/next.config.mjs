/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@glucostream/types", "@glucostream/validation"],
};

export default nextConfig;
