/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  // ✅ на проді дозволимо білд навіть якщо є TS-помилки
  typescript: { ignoreBuildErrors: true },
  reactStrictMode: true,
};
export default nextConfig;
