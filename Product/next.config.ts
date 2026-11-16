import type { NextConfig } from 'next';

const config: NextConfig = {
  // Native / WASM packages stay on the Node side, unbundled.
  serverExternalPackages: ['@huggingface/transformers', 'onnxruntime-node', '@electric-sql/pglite', '@electric-sql/pglite-pgvector'],
  reactStrictMode: true,
  poweredByHeader: false,
  // Station moved under /station when the mode-select landing page took over "/". Old links keep working.
  async redirects() {
    return ['overview', 'telemetry', 'history', 'protocol'].map((p) => ({ source: `/${p}`, destination: `/station/${p}`, permanent: false }));
  },
};

export default config;
