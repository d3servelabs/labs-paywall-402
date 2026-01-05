import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const optionalWagmiDeps = [
  '@base-org/account',
  '@coinbase/wallet-sdk',
  '@gemini-wallet/core',
  '@metamask/sdk',
  '@safe-global/safe-apps-provider',
  '@safe-global/safe-apps-sdk',
  'porto',
  'porto/internal',
];

const exampleNodeModules = path.resolve(__dirname, 'node_modules');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.resolve(__dirname, '..'),
  experimental: {
    externalDir: true,
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      wagmi: path.resolve(exampleNodeModules, 'wagmi'),
      '@wagmi/connectors': path.resolve(exampleNodeModules, '@wagmi/connectors'),
      '@wagmi/core': path.resolve(exampleNodeModules, '@wagmi/core'),
      viem: path.resolve(exampleNodeModules, 'viem'),
      'x402-react-paywall': path.resolve(__dirname, '../src/index.ts'),
      'x402-react-paywall/styles.css': path.resolve(__dirname, '../src/paywall.css'),
    };

    for (const dep of optionalWagmiDeps) {
      config.resolve.alias[dep] = false;
    }
    return config;
  },
};

export default nextConfig;
