import {
  formatUnits,
  getAddress,
  parseAbi,
  parseUnits,
  TransactionRejectedRpcError,
  UserRejectedRequestError,
  type Address,
  type Hex,
} from 'viem';
import { DEFAULT_CHAIN_CONFIGS } from './constants';
import type { BalanceInfo, ChainConfig, X402PaymentRequirement } from './types';
import { formatAmount, parseNetworkChainId } from './utils';

export const USDC_ABI = parseAbi([
  'function balanceOf(address account) external view returns (uint256)',
  'function decimals() external view returns (uint8)',
]);

export const DEFAULT_PROCESSING_TEXT = 'Processing payment...';
export const DEFAULT_TIMEOUT_SECONDS = 3600;
export const CLOCK_SKEW_SECONDS = 600;

export const TRANSFER_WITH_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const;

export type BalanceConfigEntry = {
  accept: X402PaymentRequirement;
  config?: ChainConfig;
  usdcAddress?: Address;
  error?: string;
};

export function resolveChain(
  requirement: X402PaymentRequirement | undefined,
  chainConfig?: ChainConfig,
  chainConfigs?: Record<string, ChainConfig>,
): ChainConfig | undefined {
  if (chainConfig) {
    if (requirement?.network) {
      const requirementChainId = parseNetworkChainId(requirement.network);
      if (requirementChainId && requirementChainId !== chainConfig.chainId) {
        return (
          chainConfigs?.[requirement.network] ||
          DEFAULT_CHAIN_CONFIGS[requirement.network]
        );
      }
    }
    return chainConfig;
  }
  if (requirement?.network) {
    return (
      chainConfigs?.[requirement.network] ||
      DEFAULT_CHAIN_CONFIGS[requirement.network]
    );
  }
  return undefined;
}

export function buildBalanceConfigs(
  accepts: X402PaymentRequirement[],
  chainConfig?: ChainConfig,
  chainConfigs?: Record<string, ChainConfig>,
): BalanceConfigEntry[] {
  return accepts.map((accept) => {
    const config = resolveChain(accept, chainConfig, chainConfigs);
    if (!config) {
      return {
        accept,
        config: undefined,
        error: 'Missing chain configuration',
      };
    }
    try {
      const usdcAddress = getAddress(config.usdcAddress);
      return { accept, config, usdcAddress };
    } catch {
      return { accept, config, error: 'Invalid USDC address' };
    }
  });
}

export function getAmountAtomic(requirement?: X402PaymentRequirement): string | null {
  if (!requirement) return null;
  return requirement.maxAmountRequired ?? null;
}

export function normalizeAtomicAmount(amount: string | null): string | null {
  if (!amount) return null;
  if (!amount.includes('.')) return amount;

  const [whole, fraction = ''] = amount.split('.');
  const trimmedFraction = fraction.slice(0, 6);
  const normalized = `${whole}.${trimmedFraction}`;
  try {
    return parseUnits(normalized, 6).toString();
  } catch {
    const padded = `${trimmedFraction}000000`.slice(0, 6);
    const combined = `${whole}${padded}`.replace(/^0+/, '') || '0';
    return combined;
  }
}

export function parseAmountDisplay(amountAtomic: string | null): string {
  if (!amountAtomic) return '0.00';
  try {
    const normalized = normalizeAtomicAmount(amountAtomic) ?? amountAtomic;
    const formatted = formatUnits(BigInt(normalized), 6);
    return formatAmount(Number.parseFloat(formatted));
  } catch {
    return '0.00';
  }
}

export function isUserRejection(error: unknown): boolean {
  if (!error) return false;
  if (
    error instanceof UserRejectedRequestError ||
    error instanceof TransactionRejectedRpcError
  ) {
    return true;
  }
  const err = error as { code?: number; name?: string; message?: string };
  if (err.code === 4001) return true;
  if (err.name === 'UserRejectedRequestError' || err.name === 'TransactionRejectedRpcError') {
    return true;
  }
  return Boolean(err.message?.toLowerCase().includes('user rejected'));
}

export function buildTransferAuthorizationTypedData(params: {
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: Address;
  };
  message: {
    from: Address;
    to: Address;
    value: bigint;
    validAfter: bigint;
    validBefore: bigint;
    nonce: Hex;
  };
}) {
  return {
    domain: params.domain,
    types: TRANSFER_WITH_AUTHORIZATION_TYPES,
    primaryType: 'TransferWithAuthorization',
    message: params.message,
  } as const;
}

export function pickRequirement(
  accepts: X402PaymentRequirement[],
  acceptIndex: number,
): X402PaymentRequirement | undefined {
  if (accepts.length === 0) return undefined;
  const index = Number.isFinite(acceptIndex) ? Math.trunc(acceptIndex) : 0;
  if (index >= 0 && index < accepts.length) return accepts[index];
  return accepts[0];
}

export function buildBalanceError(
  entry: BalanceConfigEntry,
  message: string,
): BalanceInfo {
  return {
    network: entry.accept.network,
    chainName: entry.config?.name ?? 'Unknown chain',
    balance: null,
    error: message,
  };
}
