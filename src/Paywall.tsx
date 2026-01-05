'use client';

import React, { useMemo } from 'react';
import {
  useAccount,
  useAccountEffect,
  useConnectors,
  useDisconnect,
} from 'wagmi';
import { DEFAULT_THEME, X402_PROTOCOL_URL } from './constants';
import type { X402PaywallProps } from './types';
import { formatAmount, shortenAddress } from './utils';
import {
  getAmountAtomic,
  parseAmountDisplay,
  pickRequirement,
  resolveChain,
} from './paywall-helpers';
import {
  useActionLock,
  useBalanceData,
  useConnectorConnect,
  useConnectorAvailability,
  usePaywallStatus,
  usePaymentSubmission,
} from './paywall-hooks';

export function X402Paywall(props: X402PaywallProps) {
  const {
    paymentRequired,
    currentUrl,
    acceptIndex = 0,
    theme = DEFAULT_THEME,
    chainConfig,
    chainConfigs,
    resourceDescription,
    testnet = false,
    showBalances = true,
    requestInit,
    onSuccess,
    onError,
    className,
  } = props;

  const {
    status,
    errorMessage,
    processingText,
    setStatus,
    setProcessingText,
    showError,
    resetState,
  } = usePaywallStatus({ onError });
  const { beginAction, endAction, isActionStale, resetAction, isActionBusy } =
    useActionLock();

  const account = useAccount();
  const connectors = useConnectors();
  const disconnect = useDisconnect();

  const accepts = paymentRequired.accepts;
  const requirement = useMemo(
    () => pickRequirement(accepts, acceptIndex),
    [accepts, acceptIndex],
  );
  const resolvedChain = resolveChain(requirement, chainConfig, chainConfigs);
  const amountAtomic = getAmountAtomic(requirement);
  const amountDisplay = parseAmountDisplay(amountAtomic);
  const normalizedDescription = resourceDescription?.trim();
  const description =
    normalizedDescription ||
    requirement?.description ||
    requirement?.resource ||
    'Access this resource';
  const brandName =
    theme.appName?.trim() || DEFAULT_THEME.appName || 'x402 Paywall';
  const brandLogo = theme.appLogo?.trim() || DEFAULT_THEME.appLogo || '';

  const connectorAvailability = useConnectorAvailability(connectors, account.status);
  const { balances, isLoading: isLoadingBalances } = useBalanceData({
    accepts,
    chainConfig,
    chainConfigs,
    address: account.address,
    showBalances,
  });
  const paymentSubmission = usePaymentSubmission({
    accountAddress: account.address,
    accountChainId: account.chainId,
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
  });
  const connectorConnect = useConnectorConnect({
    accountStatus: account.status,
    resolvedChain,
    onConnected: () => setStatus('connected'),
    beginAction,
    endAction,
    isActionStale,
    setStatus,
    setProcessingText,
    showError,
  });

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

  const isConnected = account.status === 'connected';

  const resetPaywall = (nextStatus: 'connect' | 'connected' = 'connect') => {
    resetAction();
    resetState(nextStatus);
  };

  useAccountEffect({
    onConnect() {
      if (status !== 'success') {
        setStatus('connected');
      }
    },
    onDisconnect() {
      endAction();
      resetPaywall('connect');
    },
  });

  function handleDisconnect() {
    disconnect.mutate();
  }

  function handleRetry() {
    resetPaywall(isConnected ? 'connected' : 'connect');
  }

  const resolvedChainName = resolvedChain?.name || 'Unknown chain';

  const hasRequirements = Boolean(
    requirement &&
      resolvedChain &&
      amountAtomic &&
      requirement.payTo &&
      requirement.asset,
  );
  const isBusy =
    isActionBusy ||
    status === 'processing' ||
    connectorConnect.isPending ||
    paymentSubmission.isPending;

  return (
    <div
      className={`x402-paywall ${className ? className : ''}`.trim()}
      style={themeStyle}
    >
      <div className="x402-paywall__backdrop" aria-hidden="true" />
      <div className="x402-paywall__card" role="region" aria-live="polite">
        <div className="x402-paywall__brand">
          {brandLogo ? (
            <img
              src={brandLogo}
              alt={brandName || 'App logo'}
              className="x402-paywall__logo"
            />
          ) : (
            <div className="x402-paywall__logo-placeholder">
              {brandName?.slice(0, 1) || 'P'}
            </div>
          )}
          <div className="x402-paywall__brand-text">
            <span className="x402-paywall__brand-name">{brandName}</span>
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
            {connectors.length === 0 ? (
              <div className="x402-paywall__alert">
                <strong>No wallet connectors configured.</strong>
                <span>Add connectors in your Wagmi config to continue.</span>
              </div>
            ) : (
              connectors.map((connector, index) => {
                const isAuthorized = connectorAvailability[connector.uid];
                const label =
                  isAuthorized === false
                    ? `Install ${connector.name}`
                    : `Connect ${connector.name}`;
                return (
                  <button
                    key={connector.uid}
                    type="button"
                    className={`x402-paywall__button ${
                      index === 0
                        ? 'x402-paywall__button--primary'
                        : 'x402-paywall__button--ghost'
                    }`}
                  onClick={() => void connectorConnect.connectWithConnector(connector)}
                    disabled={!hasRequirements || isBusy}
                  >
                    {label}
                  </button>
                );
              })
            )}
          </div>
        )}

        {status === 'connected' && (
          <div className="x402-paywall__section">
            <div className="x402-paywall__connected">
              <span className="x402-paywall__badge">Connected</span>
              <span className="x402-paywall__address">
                {account.address ? shortenAddress(account.address) : ''}
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
              onClick={() => void paymentSubmission.signPayment()}
              disabled={!hasRequirements || isBusy}
            >
              Authorize {amountDisplay} USDC
            </button>
            <p className="x402-paywall__hint">
              You'll sign an authorization. No gas fees.
            </p>
            <button
              type="button"
              className="x402-paywall__button x402-paywall__button--link"
              onClick={handleDisconnect}
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
                <p>Access granted.</p>
              </div>
            </div>
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
              onClick={handleRetry}
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
