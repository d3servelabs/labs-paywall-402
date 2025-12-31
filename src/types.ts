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
}

export interface BrandingConfig {
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

export interface PaymentRequirement {
  scheme: string;
  network: string;
  amount?: string | number;
  maxAmountRequired?: string | number;
  price?: string | number;
  payTo?: string;
  maxTimeoutSeconds?: number;
  asset?: string;
  extra?: {
    name?: string;
    version?: string;
  };
}

export interface PaymentRequiredResponse {
  x402Version?: number;
  resource?: {
    url?: string;
    description?: string;
    mimeType?: string;
  };
  accepts?: PaymentRequirement[];
  extensions?: unknown;
  [key: string]: unknown;
}

export interface RedirectOptions {
  successRedirectUrl?: string;
  successRedirectDelaySeconds?: number;
  autoSuccessRedirect?: boolean;
  successRedirectBtnLabel?: string;
}

export interface WalletConnectMetadata {
  name: string;
  description?: string;
  url: string;
  icons?: string[];
}

export interface WalletConnectOptions {
  projectId: string;
  chains?: number[];
  optionalChains?: number[];
  showQrModal?: boolean;
  rpcMap?: Record<number, string>;
  metadata?: WalletConnectMetadata;
}

export type PaywallState =
  | 'connect'
  | 'connected'
  | 'processing'
  | 'success'
  | 'error';

export interface BalanceInfo {
  network: string;
  chainName: string;
  balance?: number | null;
  error?: string | null;
}

export interface X402PaywallProps extends RedirectOptions {
  paymentRequired: PaymentRequiredResponse;
  currentUrl: string;
  chainConfig?: ChainConfig;
  chainConfigs?: Record<string, ChainConfig>;
  acceptIndex?: number;
  resourceDescription?: string;
  testnet?: boolean;
  walletConnectProjectId?: string;
  walletConnect?: WalletConnectOptions;
  theme?: ThemeConfig;
  branding?: BrandingConfig;
  showBalances?: boolean;
  requestInit?: RequestInit;
  onSuccess?: (
    result: unknown,
    context: {
      response: Response;
      paymentHeader: string;
      redirectOptions?: RedirectOptions;
    },
  ) => void;
  onError?: (error: Error) => void;
  className?: string;
}

export type EIP1193Provider = {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>;
  on?: (event: any, listener: (...args: any[]) => void) => any;
  removeListener?: (event: any, listener: (...args: any[]) => void) => any;
  disconnect?: () => Promise<void> | void;
};
