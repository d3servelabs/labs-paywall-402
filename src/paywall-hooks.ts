import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { formatUnits, getAddress, toHex, validateTypedData, type Address } from 'viem';
import type { Connector } from 'wagmi';
import {
  ConnectorAlreadyConnectedError,
  useConnect,
  useReadContracts,
  useSignTypedData,
  useSwitchChain,
} from 'wagmi';
import type {
  BalanceInfo,
  ChainConfig,
  X402PaymentRequirement,
  X402PaymentRequired,
} from './types';
import {
  buildBalanceConfigs,
  buildBalanceError,
  buildTransferAuthorizationTypedData,
  CLOCK_SKEW_SECONDS,
  DEFAULT_PROCESSING_TEXT,
  DEFAULT_TIMEOUT_SECONDS,
  isUserRejection,
  normalizeAtomicAmount,
  type BalanceConfigEntry,
  USDC_ABI,
} from './paywall-helpers';
import { encodeBase64Json } from './utils';

type PaywallStatus = 'connect' | 'connected' | 'processing' | 'success' | 'error';
type PaywallState = {
  status: PaywallStatus;
  errorMessage: string;
  processingText: string;
};
type PaywallAction =
  | { type: 'setStatus'; status: PaywallStatus }
  | { type: 'setProcessingText'; text: string }
  | { type: 'setError'; message: string }
  | { type: 'reset'; status: PaywallStatus; processingText: string };

type BalanceContractsCall = {
  address: Address;
  abi: typeof USDC_ABI;
  functionName: 'balanceOf' | 'decimals';
  args?: readonly [Address];
  chainId: number;
};

export function useConnectorAvailability(
  connectors: readonly Connector[],
  accountStatus: string,
) {
  const [availability, setAvailability] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;

    async function checkConnectorAvailability() {
      const results = await Promise.all(
        connectors.map(async (connector) => {
          try {
            const authorized = await connector.isAuthorized();
            return { key: connector.uid, authorized };
          } catch {
            return { key: connector.uid, authorized: false };
          }
        }),
      );
      if (cancelled) return;
      const next: Record<string, boolean> = {};
      for (const result of results) {
        next[result.key] = result.authorized;
      }
      setAvailability(next);
    }

    if (connectors.length > 0) {
      void checkConnectorAvailability();
    } else {
      setAvailability({});
    }

    return () => {
      cancelled = true;
    };
  }, [connectors, accountStatus]);

  return availability;
}

export function useBalanceData(params: {
  accepts: X402PaymentRequirement[];
  chainConfig?: ChainConfig;
  chainConfigs?: Record<string, ChainConfig>;
  address?: Address;
  showBalances: boolean;
}) {
  const { accepts, chainConfig, chainConfigs, address, showBalances } = params;

  const balanceConfigs = useMemo<BalanceConfigEntry[]>(
    () => buildBalanceConfigs(accepts, chainConfig, chainConfigs),
    [accepts, chainConfig, chainConfigs],
  );

  const balanceContracts = useMemo<BalanceContractsCall[]>(() => {
    if (!address) return [];
    const calls: BalanceContractsCall[] = [];

    for (const entry of balanceConfigs) {
      if (!entry.config || entry.error || !entry.usdcAddress) continue;
      calls.push({
        address: entry.usdcAddress,
        abi: USDC_ABI,
        functionName: 'balanceOf',
        args: [address],
        chainId: entry.config.chainId,
      });
      calls.push({
        address: entry.usdcAddress,
        abi: USDC_ABI,
        functionName: 'decimals',
        chainId: entry.config.chainId,
      });
    }

    return calls;
  }, [address, balanceConfigs]);

  const balanceQueryEnabled =
    showBalances && Boolean(address) && balanceContracts.length > 0;

  const balanceQuery = useReadContracts({
    contracts: balanceContracts,
    allowFailure: true,
    query: {
      enabled: balanceQueryEnabled,
      retry: 2,
      staleTime: 30_000,
    },
  });

  const balances = useMemo<BalanceInfo[]>(() => {
    if (!showBalances || !address || balanceConfigs.length === 0) return [];

    if (!balanceQuery.data) {
      return balanceConfigs
        .filter((entry) => !entry.config || entry.error)
        .map((entry) => buildBalanceError(entry, entry.error ?? 'Missing chain configuration'));
    }

    const results: BalanceInfo[] = [];
    let dataIndex = 0;

    for (const entry of balanceConfigs) {
      if (!entry.config || entry.error || !entry.usdcAddress) {
        results.push(buildBalanceError(entry, entry.error ?? 'Missing chain configuration'));
        continue;
      }

      const balanceResult = balanceQuery.data[dataIndex];
      const decimalsResult = balanceQuery.data[dataIndex + 1];
      dataIndex += 2;

      if (!balanceResult || !decimalsResult) {
        results.push(buildBalanceError(entry, 'Balance unavailable'));
        continue;
      }

      if (
        balanceResult.status === 'failure' ||
        decimalsResult.status === 'failure'
      ) {
        const err =
          balanceResult.status === 'failure'
            ? balanceResult.error
            : decimalsResult.error;
        const message = err instanceof Error ? err.message : 'Failed to fetch balance';
        results.push(buildBalanceError(entry, message));
        continue;
      }

      const decimalsRaw = decimalsResult.result;
      const balanceRaw = balanceResult.result;
      if (
        (typeof decimalsRaw !== 'bigint' && typeof decimalsRaw !== 'number') ||
        (typeof balanceRaw !== 'bigint' && typeof balanceRaw !== 'number')
      ) {
        results.push(buildBalanceError(entry, 'Balance unavailable'));
        continue;
      }

      const decimalsValue =
        typeof decimalsRaw === 'bigint' ? Number(decimalsRaw) : decimalsRaw;
      const balanceValue =
        typeof balanceRaw === 'bigint' ? balanceRaw : BigInt(balanceRaw);
      const formatted = Number(formatUnits(balanceValue, decimalsValue));

      results.push({
        network: entry.accept.network,
        chainName: entry.config.name,
        balance: formatted,
        error: null,
      });
    }

    return results;
  }, [address, balanceConfigs, balanceQuery.data, showBalances]);

  return {
    balances,
    isLoading: balanceQuery.isFetching,
  };
}

function paywallReducer(state: PaywallState, action: PaywallAction): PaywallState {
  switch (action.type) {
    case 'setStatus':
      return { ...state, status: action.status };
    case 'setProcessingText':
      return { ...state, processingText: action.text };
    case 'setError':
      return { ...state, status: 'error', errorMessage: action.message };
    case 'reset':
      return {
        status: action.status,
        errorMessage: '',
        processingText: action.processingText,
      };
    default:
      return state;
  }
}

export function usePaywallStatus(params?: {
  onError?: (error: Error) => void;
  defaultProcessingText?: string;
}) {
  const defaultProcessingText = params?.defaultProcessingText ?? DEFAULT_PROCESSING_TEXT;
  const onError = params?.onError;
  const [state, dispatch] = useReducer(paywallReducer, {
    status: 'connect',
    errorMessage: '',
    processingText: defaultProcessingText,
  });

  const setStatus = useCallback((status: PaywallStatus) => {
    dispatch({ type: 'setStatus', status });
  }, []);

  const setProcessingText = useCallback((text: string) => {
    dispatch({ type: 'setProcessingText', text });
  }, []);

  const showError = useCallback(
    (message: string, err?: unknown) => {
      const errorText = message || 'Payment failed. Please try again.';
      dispatch({ type: 'setError', message: errorText });
      if (err instanceof Error) {
        onError?.(err);
      } else if (message) {
        onError?.(new Error(message));
      }
    },
    [onError],
  );

  const resetState = useCallback(
    (status: PaywallStatus = 'connect') => {
      dispatch({ type: 'reset', status, processingText: defaultProcessingText });
    },
    [defaultProcessingText],
  );

  return {
    status: state.status,
    errorMessage: state.errorMessage,
    processingText: state.processingText,
    setStatus,
    setProcessingText,
    showError,
    resetState,
  };
}

export function useActionLock() {
  const actionLockRef = useRef(false);
  const actionNonceRef = useRef(0);
  const [isActionBusy, setIsActionBusy] = useState(false);

  const beginAction = useCallback((): number | null => {
    if (actionLockRef.current) return null;
    actionLockRef.current = true;
    setIsActionBusy(true);
    actionNonceRef.current += 1;
    return actionNonceRef.current;
  }, []);

  const endAction = useCallback(() => {
    actionLockRef.current = false;
    setIsActionBusy(false);
  }, []);

  const isActionStale = useCallback(
    (actionId: number) => actionNonceRef.current !== actionId,
    [],
  );

  const resetAction = useCallback(() => {
    actionNonceRef.current += 1;
    actionLockRef.current = false;
    setIsActionBusy(false);
  }, []);

  return {
    beginAction,
    endAction,
    isActionStale,
    resetAction,
    isActionBusy,
  };
}

type UsePaymentSubmissionParams = {
  accountAddress?: Address;
  accountChainId?: number;
  requirement?: X402PaymentRequirement;
  resolvedChain?: ChainConfig;
  amountAtomic?: string | null;
  paymentRequired: X402PaymentRequired;
  currentUrl: string;
  requestInit?: RequestInit;
  onSuccess?: (
    result: unknown,
    context: {
      response: Response;
      paymentHeader: string;
    },
  ) => void;
  beginAction: () => number | null;
  endAction: () => void;
  isActionStale: (actionId: number) => boolean;
  setStatus: (status: PaywallStatus) => void;
  setProcessingText: (text: string) => void;
  showError: (message: string, err?: unknown) => void;
};

type UseConnectorConnectParams = {
  accountStatus?: string;
  resolvedChain?: ChainConfig;
  onConnected: () => void;
  beginAction: () => number | null;
  endAction: () => void;
  isActionStale: (actionId: number) => boolean;
  setStatus: (status: PaywallStatus) => void;
  setProcessingText: (text: string) => void;
  showError: (message: string, err?: unknown) => void;
};

export function useConnectorConnect(params: UseConnectorConnectParams) {
  const {
    accountStatus,
    resolvedChain,
    onConnected,
    beginAction,
    endAction,
    isActionStale,
    setStatus,
    setProcessingText,
    showError,
  } = params;
  const connect = useConnect();

  const isAlreadyConnected = useCallback((error: unknown) => {
    if (!error) return false;
    if (error instanceof ConnectorAlreadyConnectedError) return true;
    const err = error as { name?: string; message?: string };
    if (err.name === 'ConnectorAlreadyConnectedError') return true;
    return Boolean(err.message?.toLowerCase().includes('already connected'));
  }, []);

  const connectWithConnector = useCallback(
    async (connector: Connector) => {
      if (!resolvedChain) {
        showError('Missing chain configuration for this payment.');
        return;
      }
      if (accountStatus === 'connected') {
        onConnected();
        return;
      }
      const actionId = beginAction();
      if (!actionId) return;

      try {
        setStatus('processing');
        setProcessingText(`Connecting ${connector.name}...`);

        await connect.mutateAsync({
          connector,
          chainId: resolvedChain.chainId,
        });
        if (isActionStale(actionId)) return;

        onConnected();
      } catch (err: unknown) {
        if (isAlreadyConnected(err)) {
          onConnected();
        } else if (isUserRejection(err)) {
          showError('Connection rejected by user', err);
        } else {
          showError((err as Error).message || 'Failed to connect wallet', err);
        }
      } finally {
        endAction();
      }
    },
    [
      accountStatus,
      beginAction,
      connect,
      endAction,
      isAlreadyConnected,
      isActionStale,
      onConnected,
      resolvedChain,
      setProcessingText,
      setStatus,
      showError,
    ],
  );

  return {
    connectWithConnector,
    isPending: connect.isPending,
  };
}

export function usePaymentSubmission(params: UsePaymentSubmissionParams) {
  const {
    accountAddress,
    accountChainId,
    requirement,
    resolvedChain,
    amountAtomic,
    paymentRequired,
    currentUrl,
    requestInit,
    onSuccess,
    beginAction,
    endAction,
    isActionStale,
    setStatus,
    setProcessingText,
    showError,
  } = params;

  const signTypedData = useSignTypedData();
  const switchChain = useSwitchChain();

  const ensureChain = useCallback(
    async (config: ChainConfig) => {
      if (accountChainId === config.chainId) return;
      try {
        await switchChain.mutateAsync({ chainId: config.chainId });
      } catch (switchError: unknown) {
        throw new Error(
          (switchError as Error).message ||
            `Please switch to ${config.name} in your wallet.`,
        );
      }
    },
    [accountChainId, switchChain],
  );

  const signPayment = useCallback(async () => {
    if (!accountAddress) {
      showError('Wallet not connected.');
      return;
    }

    if (!requirement || !resolvedChain) {
      showError('Missing payment requirement or chain configuration.');
      return;
    }

    if (!requirement.payTo || !amountAtomic || !requirement.asset) {
      showError('Payment requirement missing required fields.');
      return;
    }

    const extra = requirement.extra as { name?: unknown; version?: unknown } | undefined;
    const domainName = typeof extra?.name === 'string' ? extra.name : null;
    const domainVersion = typeof extra?.version === 'string' ? extra.version : null;

    if (!domainName || !domainVersion) {
      showError('Payment requirement missing EIP-712 domain details.');
      return;
    }

    const actionId = beginAction();
    if (!actionId) return;

    try {
      setStatus('processing');
      setProcessingText('Checking network...');
      await ensureChain(resolvedChain);
      if (isActionStale(actionId)) return;
      setProcessingText('Preparing payment...');

      const from = getAddress(accountAddress);
      const to = getAddress(requirement.payTo);
      const asset = getAddress(requirement.asset);
      const normalizedAmount = normalizeAtomicAmount(amountAtomic) ?? amountAtomic;
      const value = BigInt(normalizedAmount);
      const maxTimeoutSeconds = requirement.maxTimeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS;
      const now = Math.floor(Date.now() / 1000);
      const validAfter = BigInt(now - CLOCK_SKEW_SECONDS);
      const validBefore = BigInt(now + maxTimeoutSeconds);
      const nonce = toHex(crypto.getRandomValues(new Uint8Array(32)));

      const domain = {
        name: domainName,
        version: domainVersion,
        chainId: resolvedChain.chainId,
        verifyingContract: asset,
      };

      const message = {
        from,
        to,
        value,
        validAfter,
        validBefore,
        nonce,
      };

      setProcessingText('Please sign in your wallet...');

      const typedData = buildTransferAuthorizationTypedData({ domain, message });
      validateTypedData(typedData);

      const signature = await signTypedData.mutateAsync(typedData);
      if (isActionStale(actionId)) return;

      setProcessingText('Submitting payment...');

      const paymentPayload = {
        x402Version: paymentRequired.x402Version,
        scheme: requirement.scheme,
        network: requirement.network,
        payload: {
          signature,
          authorization: {
            from,
            to,
            value: value.toString(),
            validAfter: validAfter.toString(),
            validBefore: validBefore.toString(),
            nonce,
          },
        },
      };

      const paymentHeader = encodeBase64Json(paymentPayload);

      const headers = new Headers(requestInit?.headers);
      headers.set('X-PAYMENT-SIGNATURE', paymentHeader);
      headers.set('PAYMENT-SIGNATURE', paymentHeader);
      headers.set('Accept', 'application/json');

      const response = await fetch(currentUrl, {
        method: requestInit?.method || 'GET',
        ...requestInit,
        headers,
      });
      if (isActionStale(actionId)) return;

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const message =
          (errorData as { message?: string }).message ||
          'Payment verification failed';
        throw new Error(message);
      }

      let result: unknown;
      try {
        result = await response.json();
      } catch {
        result = await response.text();
      }
      if (isActionStale(actionId)) return;

      setStatus('success');
      onSuccess?.(result, { response, paymentHeader });
    } catch (err: unknown) {
      if (isUserRejection(err)) {
        showError('Transaction rejected by user', err);
      } else {
        showError((err as Error).message || 'Payment failed. Please try again.', err);
      }
    } finally {
      endAction();
    }
  }, [
    accountAddress,
    amountAtomic,
    beginAction,
    endAction,
    ensureChain,
    isActionStale,
    onSuccess,
    paymentRequired.x402Version,
    requestInit,
    requirement,
    resolvedChain,
    setProcessingText,
    setStatus,
    showError,
    signTypedData,
    currentUrl,
  ]);

  return {
    signPayment,
    isPending: signTypedData.isPending || switchChain.isPending,
  };
}
