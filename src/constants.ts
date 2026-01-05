import type { ChainConfig, ThemeConfig } from './types';

export const DEFAULT_THEME: ThemeConfig = {
  background: '#f5f6fb',
  card: '#ffffff',
  foreground: '#0b0d14',
  muted: '#5b6270',
  brandPrimary: '#3b6cff',
  brandPrimaryHover: '#2b56f0',
  destructive: '#e5484d',
  border: 'rgba(15, 23, 42, 0.12)',
  borderRadius: '20px',
  appName: 'x402 Paywall',
  appLogo: '',
};

export const X402_PROTOCOL_URL = 'https://x402.org';

export const DEFAULT_CHAIN_CONFIGS: Record<string, ChainConfig> = {
  'eip155:8453': {
    chainId: 8453,
    name: 'Base',
    usdcAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    rpcUrl: 'https://mainnet.base.org',
    blockExplorer: 'https://basescan.org',
  },
  'eip155:84532': {
    chainId: 84532,
    name: 'Base Sepolia',
    usdcAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    rpcUrl: 'https://sepolia.base.org',
    blockExplorer: 'https://sepolia.basescan.org',
  },
};
