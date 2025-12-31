'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  createPublicClient,
  createWalletClient,
  custom,
  formatUnits,
  getAddress,
  http,
  parseAbi,
  toHex,
  type Address,
  type Chain,
} from 'viem';
import { base, baseSepolia } from 'viem/chains';
import {
  DEFAULT_AUTO_REDIRECT,
  DEFAULT_BRANDING,
  DEFAULT_CHAIN_CONFIGS,
  DEFAULT_REDIRECT_DELAY,
  DEFAULT_REDIRECT_LABEL,
  DEFAULT_THEME,
  X402_PROTOCOL_URL,
} from './constants';
import type {
  BalanceInfo,
  ChainConfig,
  EIP1193Provider,
  PaymentRequirement,
  RedirectOptions,
  WalletConnectOptions,
  X402PaywallProps,
} from './types';
import {
  decodeBase64Json,
  encodeBase64Json,
  formatAmount,
  hasInjectedWallet,
  isMobileUserAgent,
  parseNetworkChainId,
  shortenAddress,
  toChainIdHex,
} from './utils';

const USDC_ABI = parseAbi([
  'function transfer(address recipient, uint256 amount) external returns (bool)',
  'function balanceOf(address account) external view returns (uint256)',
  'function decimals() external view returns (uint8)',
]);

const PAYWALL_REDIRECT_HEADER = 'X-PAYWALL-REDIRECT-OPTIONS';

type ConnectedProvider = {
  provider: EIP1193Provider;
  source: 'injected' | 'walletconnect';
};

function resolveChain(
  requirement: PaymentRequirement | undefined,
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

function resolveViemChain(chainConfig: ChainConfig): Chain {
  if (chainConfig.chainId === base.id) return base;
  if (chainConfig.chainId === baseSepolia.id) return baseSepolia;

  return {
    id: chainConfig.chainId,
    name: chainConfig.name,
    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
    rpcUrls: {
      default: {
        http: [chainConfig.rpcUrl],
      },
    },
    blockExplorers: {
      default: {
        name: 'Explorer',
        url: chainConfig.blockExplorer,
      },
    },
  };
}

function getAmountAtomic(requirement?: PaymentRequirement): string | null {
  if (!requirement) return null;
  const raw =
    requirement.amount ?? requirement.maxAmountRequired ?? requirement.price ?? null;
  if (raw === null || raw === undefined) return null;
  return typeof raw === 'string' ? raw : String(raw);
}

function normalizeAtomicAmount(amount: string | null): string | null {
  if (!amount) return null;
  if (!amount.includes('.')) return amount;

  const [whole, fraction = ''] = amount.split('.');
  const padded = `${fraction}000000`.slice(0, 6);
  const combined = `${whole}${padded}`.replace(/^0+/, '') || '0';
  return combined;
}

function parseAmountDisplay(amountAtomic: string | null): string {
  if (!amountAtomic) return '0.00';
  try {
    const normalized = normalizeAtomicAmount(amountAtomic) ?? amountAtomic;
    const formatted = formatUnits(BigInt(normalized), 6);
    return formatAmount(Number.parseFloat(formatted));
  } catch {
    return '0.00';
  }
}

function buildRedirectOptions(
  props: RedirectOptions,
  headerValue?: string | null,
): RedirectOptions {
  const headerOptions = decodeBase64Json<RedirectOptions>(headerValue);
  return {
    successRedirectUrl: props.successRedirectUrl,
    successRedirectDelaySeconds:
      props.successRedirectDelaySeconds ?? DEFAULT_REDIRECT_DELAY,
    autoSuccessRedirect: props.autoSuccessRedirect ?? DEFAULT_AUTO_REDIRECT,
    successRedirectBtnLabel:
      props.successRedirectBtnLabel ?? DEFAULT_REDIRECT_LABEL,
    ...headerOptions,
  };
}

function resolveWalletConnectOptions(
  options: WalletConnectOptions | undefined,
  projectId?: string,
): WalletConnectOptions | null {
  const resolvedProjectId = options?.projectId ?? projectId;
  if (!resolvedProjectId) return null;
  return {
    ...options,
    projectId: resolvedProjectId,
  };
}

export function X402Paywall(props: X402PaywallProps) {
  const {
    paymentRequired,
    currentUrl,
    acceptIndex = 0,
    theme = DEFAULT_THEME,
    branding = DEFAULT_BRANDING,
    chainConfig,
    chainConfigs,
    resourceDescription,
    testnet = false,
    walletConnectProjectId,
    walletConnect,
    showBalances = true,
    requestInit,
    onSuccess,
    onError,
    className,
  } = props;

  const [status, setStatus] = useState<'connect' | 'connected' | 'processing' | 'success' | 'error'>(
    'connect',
  );
  const [connectedAddress, setConnectedAddress] = useState<string | null>(null);
  const [providerInfo, setProviderInfo] = useState<ConnectedProvider | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [processingText, setProcessingText] = useState('Processing payment...');
  const [balances, setBalances] = useState<BalanceInfo[]>([]);
  const [isLoadingBalances, setIsLoadingBalances] = useState(false);
  const [redirectCountdown, setRedirectCountdown] = useState<number | null>(null);
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);
  const [redirectBtnLabel, setRedirectBtnLabel] = useState(DEFAULT_REDIRECT_LABEL);

  const accepts = useMemo(() => paymentRequired.accepts ?? [], [paymentRequired]);
  const requirement = accepts[acceptIndex];
  const resolvedChain = resolveChain(requirement, chainConfig, chainConfigs);
  const amountAtomic = getAmountAtomic(requirement);
  const amountDisplay = parseAmountDisplay(amountAtomic);
  const description =
    resourceDescription || paymentRequired.resource?.description || 'Access this resource';

  const walletConnectConfig = useMemo(
    () => resolveWalletConnectOptions(walletConnect, walletConnectProjectId),
    [walletConnect, walletConnectProjectId],
  );

  const themeStyle = useMemo(
    () =>
      ({
        '--x402-bg': theme.background,
        '--x402-card': theme.card,
        '--x402-text': theme.foreground,
        '--x402-muted': theme.muted,
        '--x402-primary': theme.brandPrimary,
        '--x402-primary-hover': theme.brandPrimaryHover,
        '--x402-danger': theme.destructive,
        '--x402-border': theme.border,
        '--x402-radius': theme.borderRadius || DEFAULT_THEME.borderRadius,
      }) as React.CSSProperties,
    [theme],
  );

  useEffect(() => {
    if (!providerInfo?.provider?.on) return undefined;

    const handleAccountsChanged = (accounts: unknown) => {
      if (!Array.isArray(accounts) || accounts.length === 0) {
        resetState();
        return;
      }
      setConnectedAddress(String(accounts[0]));
    };

    const handleChainChanged = () => {
      if (!resolvedChain) return;
      void ensureChain(providerInfo.provider, resolvedChain).catch(() => {
        // No-op; chain switch prompt will show on next action
      });
    };

    providerInfo.provider.on('accountsChanged', handleAccountsChanged);
    providerInfo.provider.on('chainChanged', handleChainChanged);

    return () => {
      providerInfo.provider.removeListener?.('accountsChanged', handleAccountsChanged);
      providerInfo.provider.removeListener?.('chainChanged', handleChainChanged);
    };
  }, [providerInfo, resolvedChain]);

  useEffect(() => {
    if (!redirectUrl || redirectCountdown === null) return undefined;
    if (redirectCountdown <= 0) {
      window.location.href = redirectUrl;
      return undefined;
    }

    const timer = window.setInterval(() => {
      setRedirectCountdown((current) => {
        if (current === null) return null;
        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [redirectCountdown, redirectUrl]);

  useEffect(() => {
    if (!showBalances || !connectedAddress || !resolvedChain || !accepts.length) return;
    void fetchBalances(connectedAddress);
  }, [showBalances, connectedAddress, resolvedChain, accepts.length]);

  function showError(message: string, err?: unknown) {
    const errorText = message || 'Payment failed. Please try again.';
    setErrorMessage(errorText);
    setStatus('error');
    if (err instanceof Error) {
      onError?.(err);
    } else if (message) {
      onError?.(new Error(message));
    }
  }

  function resetState() {
    if (providerInfo?.provider?.disconnect) {
      try {
        providerInfo.provider.disconnect();
      } catch {
        // ignore disconnect errors
      }
    }
    setProviderInfo(null);
    setConnectedAddress(null);
    setBalances([]);
    setErrorMessage('');
    setRedirectCountdown(null);
    setRedirectUrl(null);
    setRedirectBtnLabel(DEFAULT_REDIRECT_LABEL);
    setProcessingText('Processing payment...');
    setStatus('connect');
  }

  async function ensureChain(provider: EIP1193Provider, config: ChainConfig) {
    const targetHex = toChainIdHex(config.chainId).toLowerCase();
    const currentChainId = await provider.request({ method: 'eth_chainId' });
    const currentHex =
      typeof currentChainId === 'string'
        ? currentChainId
        : toChainIdHex(Number(currentChainId));
    if (currentHex && currentHex.toLowerCase() === targetHex) return;

    try {
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: targetHex }],
      });
    } catch (switchError: unknown) {
      const errorCode = (switchError as { code?: number }).code;
      if (errorCode === 4902) {
        try {
          await provider.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: targetHex,
                chainName: config.name,
                nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
                rpcUrls: [config.rpcUrl],
                blockExplorerUrls: [config.blockExplorer],
              },
            ],
          });
        } catch (addError: unknown) {
          if ((addError as { code?: number }).code === 4001) {
            throw new Error('Network add rejected by user.');
          }
          throw new Error(
            (addError as Error).message ||
              `Please add ${config.name} in your wallet.`,
          );
        }
      } else if (errorCode === 4001) {
        throw new Error('Network switch rejected by user.');
      } else {
        throw new Error(
          (switchError as Error).message ||
            `Please switch to ${config.name} in your wallet.`,
        );
      }
    }
  }

  async function connectInjected() {
    if (!hasInjectedWallet()) {
      if (isMobileUserAgent()) {
        window.location.href = `https://metamask.app.link/dapp/${window.location.host}${window.location.pathname}${window.location.search}`;
        return;
      }
      showError('No wallet detected. Please install MetaMask or another Web3 wallet.');
      return;
    }

    if (!resolvedChain) {
      showError('Missing chain configuration for this payment.');
      return;
    }

    try {
      setStatus('processing');
      setProcessingText('Connecting wallet...');

      const provider = (window as typeof window & { ethereum?: EIP1193Provider }).ethereum;
      if (!provider) {
        showError('Wallet provider not found.');
        return;
      }

      const accounts = (await provider.request({
        method: 'eth_requestAccounts',
      })) as string[];

      if (!accounts?.length) {
        throw new Error('No accounts returned');
      }

      await ensureChain(provider, resolvedChain);

      setConnectedAddress(accounts[0]);
      setProviderInfo({ provider, source: 'injected' });
      setStatus('connected');
    } catch (err: unknown) {
      if ((err as { code?: number }).code === 4001) {
        showError('Connection rejected by user', err);
      } else {
        showError((err as Error).message || 'Failed to connect wallet', err);
      }
    }
  }

  async function connectWalletConnect() {
    if (!walletConnectConfig?.projectId) {
      showError('WalletConnect is not configured.');
      return;
    }

    if (!resolvedChain) {
      showError('Missing chain configuration for this payment.');
      return;
    }

    try {
      setStatus('processing');
      setProcessingText('Opening WalletConnect...');

      const { default: EthereumProvider } = await import(
        '@walletconnect/ethereum-provider'
      );

      const baseChains = walletConnectConfig.chains ?? [resolvedChain.chainId];
      const chains = Array.from(new Set(baseChains));
      const optionalChains = walletConnectConfig.optionalChains ?? [];
      if (!chains.length) {
        showError('WalletConnect chains are not configured.');
        return;
      }
      const requiredChains = chains as [number, ...number[]];
      const optionalChainsList = optionalChains.length
        ? (optionalChains as [number, ...number[]])
        : requiredChains;
      const hasResolvedChain =
        requiredChains.includes(resolvedChain.chainId) ||
        optionalChainsList.includes(resolvedChain.chainId);
      if (!hasResolvedChain) {
        showError(
          `WalletConnect config must include chain ${resolvedChain.chainId} (${resolvedChain.name}).`,
        );
        return;
      }

      const fallbackMetadata = {
        name: branding.appName || 'x402 Paywall',
        description: description || 'x402 paywall checkout',
        url: window.location.origin,
        icons: branding.appLogo ? [branding.appLogo] : [],
      };

      const resolvedMetadata = walletConnectConfig.metadata
        ? {
            ...walletConnectConfig.metadata,
            description:
              walletConnectConfig.metadata.description ?? fallbackMetadata.description,
            icons: walletConnectConfig.metadata.icons ?? fallbackMetadata.icons,
          }
        : fallbackMetadata;

      const wcProvider = await EthereumProvider.init({
        projectId: walletConnectConfig.projectId,
        chains: requiredChains,
        optionalChains: optionalChainsList,
        showQrModal: walletConnectConfig.showQrModal ?? true,
        rpcMap:
          walletConnectConfig.rpcMap ?? {
            [resolvedChain.chainId]: resolvedChain.rpcUrl,
          },
        metadata: resolvedMetadata,
      });

      if (wcProvider.enable) {
        await wcProvider.enable();
      } else if (wcProvider.connect) {
        await wcProvider.connect();
      }

      const accounts = (await wcProvider.request({
        method: 'eth_requestAccounts',
      })) as string[];

      if (!accounts?.length) {
        throw new Error('No accounts returned');
      }

      await ensureChain(wcProvider, resolvedChain);

      setConnectedAddress(accounts[0]);
      setProviderInfo({ provider: wcProvider, source: 'walletconnect' });
      setStatus('connected');
    } catch (err: unknown) {
      showError(
        (err as Error).message || 'Failed to connect via WalletConnect',
        err,
      );
    }
  }

  async function fetchBalances(address: string) {
    if (!resolvedChain || !accepts.length) return;

    setIsLoadingBalances(true);
    try {
      const balanceResults = await Promise.all(
        accepts.map(async (accept) => {
          const config = resolveChain(accept, chainConfig, chainConfigs);
          if (!config) {
            return {
              network: accept.network,
              chainName: 'Unknown chain',
              balance: null,
              error: 'Missing chain configuration',
            } as BalanceInfo;
          }

          try {
            const publicClient = createPublicClient({
              chain: resolveViemChain(config),
              transport: http(config.rpcUrl),
            });

            const [balance, decimals] = await Promise.all([
              publicClient.readContract({
                address: config.usdcAddress as Address,
                abi: USDC_ABI,
                functionName: 'balanceOf',
                args: [address as Address],
              }),
              publicClient.readContract({
                address: config.usdcAddress as Address,
                abi: USDC_ABI,
                functionName: 'decimals',
              }),
            ]);

            const decimalsValue = typeof decimals === 'bigint' ? Number(decimals) : decimals;
            const formatted = Number(formatUnits(balance, decimalsValue));
            return {
              network: accept.network,
              chainName: config.name,
              balance: formatted,
              error: null,
            } as BalanceInfo;
          } catch (err: unknown) {
            return {
              network: accept.network,
              chainName: config.name,
              balance: null,
              error: (err as Error).message || 'Failed to fetch balance',
            } as BalanceInfo;
          }
        }),
      );

      setBalances(balanceResults);
    } finally {
      setIsLoadingBalances(false);
    }
  }

  async function signPayment() {
    if (!providerInfo?.provider || !connectedAddress) {
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

    if (!requirement.extra?.name || !requirement.extra?.version) {
      showError('Payment requirement missing EIP-712 domain details.');
      return;
    }

    try {
      setStatus('processing');
      setProcessingText('Checking network...');
      await ensureChain(providerInfo.provider, resolvedChain);
      setProcessingText('Preparing payment...');

      const from = getAddress(connectedAddress) as Address;
      const to = getAddress(requirement.payTo) as Address;
      const asset = getAddress(requirement.asset) as Address;
      const normalizedAmount = normalizeAtomicAmount(amountAtomic) ?? amountAtomic;
      const value = BigInt(normalizedAmount);
      const maxTimeoutSeconds = requirement.maxTimeoutSeconds || 3600;
      const now = Math.floor(Date.now() / 1000);
      const validAfter = BigInt(now - 600);
      const validBefore = BigInt(now + maxTimeoutSeconds);
      const nonce = toHex(crypto.getRandomValues(new Uint8Array(32)));

      const domain = {
        name: requirement.extra.name,
        version: requirement.extra.version,
        chainId: resolvedChain.chainId,
        verifyingContract: asset,
      };

      const types = {
        TransferWithAuthorization: [
          { name: 'from', type: 'address' },
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'validAfter', type: 'uint256' },
          { name: 'validBefore', type: 'uint256' },
          { name: 'nonce', type: 'bytes32' },
        ],
      } as const;

      const message = {
        from,
        to,
        value,
        validAfter,
        validBefore,
        nonce,
      };

      setProcessingText('Please sign in your wallet...');

      const walletClient = createWalletClient({
        account: from,
        chain: resolveViemChain(resolvedChain),
        transport: custom(providerInfo.provider),
      });

      const signature = await walletClient.signTypedData({
        account: from,
        domain,
        types,
        primaryType: 'TransferWithAuthorization',
        message,
      });

      setProcessingText('Submitting payment...');

      const paymentPayload = {
        x402Version: 2,
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
        accepted: requirement,
        resource: paymentRequired.resource,
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

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const message =
          (errorData as { message?: string }).message || 'Payment verification failed';
        throw new Error(message);
      }

      const redirectOptions = buildRedirectOptions(
        props,
        response.headers.get(PAYWALL_REDIRECT_HEADER),
      );

      let result: unknown;
      try {
        result = await response.json();
      } catch {
        result = await response.text();
      }

      setStatus('success');

      onSuccess?.(result, { response, paymentHeader, redirectOptions });

      if (redirectOptions.successRedirectUrl) {
        if (redirectOptions.autoSuccessRedirect === false) {
          setRedirectUrl(redirectOptions.successRedirectUrl);
          setRedirectBtnLabel(
            redirectOptions.successRedirectBtnLabel || DEFAULT_REDIRECT_LABEL,
          );
          setRedirectCountdown(null);
        } else {
          const delay = redirectOptions.successRedirectDelaySeconds ?? DEFAULT_REDIRECT_DELAY;
          setRedirectUrl(redirectOptions.successRedirectUrl);
          setRedirectBtnLabel(
            redirectOptions.successRedirectBtnLabel || DEFAULT_REDIRECT_LABEL,
          );
          setRedirectCountdown(delay);
        }
      }
    } catch (err: unknown) {
      if ((err as { code?: number }).code === 4001) {
        showError('Transaction rejected by user', err);
      } else {
        showError((err as Error).message || 'Payment failed. Please try again.', err);
      }
    }
  }

  const showWalletConnect = Boolean(walletConnectConfig?.projectId);
  const connectLabel = !hasInjectedWallet() && isMobileUserAgent()
    ? 'Open in MetaMask'
    : 'Connect wallet';

  const resolvedChainName = resolvedChain?.name || 'Unknown chain';

  const hasRequirements = Boolean(requirement && resolvedChain && amountAtomic);

  return (
    <div
      className={`x402-paywall ${className ? className : ''}`.trim()}
      style={themeStyle}
    >
      <div className="x402-paywall__backdrop" aria-hidden="true" />
      <div className="x402-paywall__card" role="region" aria-live="polite">
        <div className="x402-paywall__brand">
          {branding.appLogo ? (
            <img
              src={branding.appLogo}
              alt={branding.appName || 'App logo'}
              className="x402-paywall__logo"
            />
          ) : (
            <div className="x402-paywall__logo-placeholder">
              {branding.appName?.slice(0, 1) || 'P'}
            </div>
          )}
          <div className="x402-paywall__brand-text">
            <span className="x402-paywall__brand-name">{branding.appName}</span>
            <span className="x402-paywall__brand-caption">Secure x402 checkout</span>
          </div>
        </div>

        <div className="x402-paywall__header">
          <h1>Unlock access</h1>
          <p>{description}</p>
        </div>

        <div className="x402-paywall__price">
          <div className="x402-paywall__price-main">
            <span className="x402-paywall__amount">{amountDisplay}</span>
            <span className="x402-paywall__unit">USDC</span>
          </div>
          <div className="x402-paywall__chain x402-paywall__price-meta">
            <span>
              {resolvedChainName}
              {testnet ? ' (Testnet)' : ''}
            </span>
          </div>
        </div>

        {!hasRequirements && (
          <div className="x402-paywall__alert">
            <strong>Missing payment configuration.</strong>
            <span>
              Ensure the payment requirement and chain configuration are provided
              before rendering the paywall.
            </span>
          </div>
        )}

        {status === 'connect' && (
          <div className="x402-paywall__section">
            <button
              type="button"
              className="x402-paywall__button x402-paywall__button--primary"
              onClick={() => void connectInjected()}
              disabled={!hasRequirements}
            >
              {connectLabel}
            </button>
            {showWalletConnect && (
              <button
                type="button"
                className="x402-paywall__button x402-paywall__button--ghost"
                onClick={() => void connectWalletConnect()}
                disabled={!hasRequirements}
              >
                WalletConnect
              </button>
            )}
          </div>
        )}

        {status === 'connected' && (
          <div className="x402-paywall__section">
            <div className="x402-paywall__connected">
              <span className="x402-paywall__badge">Connected</span>
              <span className="x402-paywall__address">
                {connectedAddress ? shortenAddress(connectedAddress) : ''}
              </span>
            </div>

            {showBalances && (
              <div className="x402-paywall__balances">
                <div className="x402-paywall__balances-header">
                  <span>USDC Balances</span>
                  {isLoadingBalances ? <em>Checking...</em> : null}
                </div>
                {balances.length === 0 && !isLoadingBalances && (
                  <span className="x402-paywall__balances-empty">
                    No balances available.
                  </span>
                )}
                {balances.map((balance) => (
                  <div key={balance.network} className="x402-paywall__balance-row">
                    <span>{balance.chainName}</span>
                    <span>
                      {balance.error
                        ? 'Unavailable'
                        : formatAmount(balance.balance ?? 0)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              className="x402-paywall__button x402-paywall__button--primary"
              onClick={() => void signPayment()}
            >
              Authorize {amountDisplay} USDC
            </button>
            <p className="x402-paywall__hint">
              You'll sign an authorization. No gas fees.
            </p>
            <button
              type="button"
              className="x402-paywall__button x402-paywall__button--link"
              onClick={resetState}
            >
              Disconnect
            </button>
          </div>
        )}

        {status === 'processing' && (
          <div className="x402-paywall__section x402-paywall__section--center">
            <div className="x402-paywall__spinner" />
            <p className="x402-paywall__processing">{processingText}</p>
            <p className="x402-paywall__subtext">
              Confirm the request in your wallet.
            </p>
          </div>
        )}

        {status === 'success' && (
          <div className="x402-paywall__section">
            <div className="x402-paywall__success">
              <div className="x402-paywall__success-icon">✓</div>
              <div>
                <h2>Payment successful</h2>
                {redirectCountdown !== null && redirectUrl ? (
                  <p>Redirecting in {redirectCountdown}s...</p>
                ) : (
                  <p>Access granted.</p>
                )}
              </div>
            </div>

            {redirectUrl && redirectCountdown === null && (
              <button
                type="button"
                className="x402-paywall__button x402-paywall__button--primary"
                onClick={() => {
                  window.location.href = redirectUrl;
                }}
              >
                {redirectBtnLabel}
              </button>
            )}
          </div>
        )}

        {status === 'error' && (
          <div className="x402-paywall__section">
            <div className="x402-paywall__alert x402-paywall__alert--error">
              <strong>Payment failed</strong>
              <span>{errorMessage}</span>
            </div>
            <button
              type="button"
              className="x402-paywall__button x402-paywall__button--ghost"
              onClick={resetState}
            >
              Try again
            </button>
          </div>
        )}
      </div>

      <div className="x402-paywall__footer">
        Powered by{' '}
        <a href={X402_PROTOCOL_URL} target="_blank" rel="noreferrer">
          x402 Protocol
        </a>
      </div>
    </div>
  );
}
