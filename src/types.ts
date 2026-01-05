export interface ThemeConfig {
  background: string;
  card: string;
  foreground: string;
  muted: string;
  brandPrimary: string;
  brandPrimaryHover: string;
  destructive: string;
  border: string;
  borderRadius?: string;
  appName?: string;
  appLogo?: string;
}

export interface ChainConfig {
  chainId: number;
  name: string;
  usdcAddress: string;
  rpcUrl: string;
  blockExplorer: string;
}

export interface X402PaymentRequirement {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  resource: string;
  description?: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  mimeType?: string;
  outputSchema?: object | null;
  extra?: Record<string, unknown>;
}

export interface X402PaymentRequired {
  x402Version: number;
  error?: string;
  accepts: X402PaymentRequirement[];
}

export interface BalanceInfo {
  network: string;
  chainName: string;
  balance?: number | null;
  error?: string | null;
}

export interface X402PaywallProps {
  paymentRequired: X402PaymentRequired;
  currentUrl: string;
  chainConfig?: ChainConfig;
  chainConfigs?: Record<string, ChainConfig>;
  acceptIndex?: number;
  resourceDescription?: string;
  testnet?: boolean;
  theme?: ThemeConfig;
  showBalances?: boolean;
  requestInit?: RequestInit;
  onSuccess?: (
    result: unknown,
    context: {
      response: Response;
      paymentHeader: string;
    },
  ) => void;
  onError?: (error: Error) => void;
  className?: string;
}
