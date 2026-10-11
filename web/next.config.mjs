/** @type {import('next').NextConfig} */
const nextConfig = {
  // The app imports the shared SDK from ../sdk.
  experimental: { externalDir: true },
  serverExternalPackages: ["@coral-xyz/anchor", "@solana/web3.js", "@solana/spl-token"],
};
export default nextConfig;
