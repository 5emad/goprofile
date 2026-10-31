/** Static export: nginx serves the files and enforces a strict CSP (no inline scripts). */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  reactStrictMode: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  images: { unoptimized: true },
}

export default nextConfig
