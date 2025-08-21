import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
    ],
  },
  async rewrites() {
    return [
      // These are server-side only rewrites
      // Client-side calls should use the full path with /api/
      { source: '/api/upload', destination: '/api/upload' },
      { source: '/api/llm/adhoc', destination: '/api/llm/adhoc' },
      { source: '/api/llm/batch', destination: '/api/llm/batch' },
      { source: '/api/web/company', destination: '/api/web/company' },
      { source: '/api/web/company/bulk', destination: '/api/web/company/bulk' },
      { source: '/api/issues', destination: '/api/issues' },
      { source: '/api/issues/apply', destination: '/api/issues/apply' },
      { source: '/api/issues/reject', destination: '/api/issues/reject' },
      { source: '/api/issues/apply-safe', destination: '/api/issues/apply-safe' },
      { source: '/api/rules', destination: '/api/rules' },
      { source: '/api/export/bq', destination: '/api/export/bq' },
    ]
  },
};

export default nextConfig;
