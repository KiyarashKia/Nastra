import type { NextConfig } from 'next';

const config: NextConfig = {
  // Native / WASM packages stay on the Node side, unbundled.
  serverExternalPackages: ['@huggingface/transformers', 'onnxruntime-node', '@electric-sql/pglite', '@electric-sql/pglite-pgvector'],
  reactStrictMode: true,
  poweredByHeader: false,
};

export default config;
