import { useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_CHAIN_CONFIGS,
  decodeBase64Json,
  type PaymentRequiredResponse,
  X402Paywall,
  type ThemeConfig,
  type BrandingConfig,
  type WalletConnectOptions,
} from '@x402/paywall';

const themes: Record<string, ThemeConfig> = {
  privy: {
    background: '#f5f6fb',
    card: '#ffffff',
    foreground: '#0b0d14',
    muted: '#5b6270',
    brandPrimary: '#3b6cff',
    brandPrimaryHover: '#2b56f0',
    destructive: '#e5484d',
    border: 'rgba(15, 23, 42, 0.12)',
    borderRadius: '20px',
  },
  namefi: {
    background: '#0b0f0d',
    card: '#111916',
    foreground: '#f5fff9',
    muted: '#9fb3a8',
    brandPrimary: '#1cd17d',
    brandPrimaryHover: '#16b96f',
    destructive: '#ff6b6b',
    border: 'rgba(28, 209, 125, 0.22)',
    borderRadius: '20px',
  },
  sky: {
    background: '#eef6ff',
    card: '#ffffff',
    foreground: '#0b1220',
    muted: '#526079',
    brandPrimary: '#0ea5e9',
    brandPrimaryHover: '#0284c7',
    destructive: '#ef4444',
    border: 'rgba(11, 18, 32, 0.12)',
    borderRadius: '20px',
  },
  ember: {
    background: '#fff5ed',
    card: '#ffffff',
    foreground: '#2b1607',
    muted: '#8a5a45',
    brandPrimary: '#f97316',
    brandPrimaryHover: '#ea580c',
    destructive: '#ef4444',
    border: 'rgba(43, 22, 7, 0.12)',
    borderRadius: '20px',
  },
  sage: {
    background: '#f3f7f1',
    card: '#ffffff',
    foreground: '#162119',
    muted: '#5b6f5c',
    brandPrimary: '#22c55e',
    brandPrimaryHover: '#16a34a',
    destructive: '#ef4444',
    border: 'rgba(22, 33, 25, 0.12)',
    borderRadius: '20px',
  },
  slate: {
    background: '#f4f5f8',
    card: '#ffffff',
    foreground: '#0f172a',
    muted: '#6b7280',
    brandPrimary: '#14b8a6',
    brandPrimaryHover: '#0d9488',
    destructive: '#ef4444',
    border: 'rgba(15, 23, 42, 0.12)',
    borderRadius: '20px',
  },
  noir: {
    background: '#0b0f1a',
    card: '#111827',
    foreground: '#f9fafb',
    muted: '#a3b1c6',
    brandPrimary: '#38bdf8',
    brandPrimaryHover: '#0ea5e9',
    destructive: '#f87171',
    border: 'rgba(148, 163, 184, 0.18)',
    borderRadius: '22px',
  },
};

const brands: Record<string, BrandingConfig> = {
  privy: {
    appName: 'Privy Studio',
    appLogo: 'https://dummyimage.com/96x32/3b6cff/ffffff&text=Privy',
  },
  namefi: {
    appName: 'Namefi',
    appLogo: '/namefi-logotype.svg',
  },
  aurora: {
    appName: 'Aurora Labs',
    appLogo: 'https://dummyimage.com/96x32/0ea5e9/ffffff&text=Aurora',
  },
  ember: {
    appName: 'Ember Analytics',
    appLogo: 'https://dummyimage.com/96x32/f97316/ffffff&text=Ember',
  },
  sage: {
    appName: 'Sage Ledger',
    appLogo: 'https://dummyimage.com/96x32/22c55e/ffffff&text=Sage',
  },
  noir: {
    appName: 'Noir Cloud',
    appLogo: 'https://dummyimage.com/96x32/111827/ffffff&text=Noir',
  },
};

const DEMO_URL = '/api/x402/demo';
const CUSTOM_THEME_KEY = 'custom';
const CUSTOM_BRAND_KEY = 'custom';
const DEFAULT_THEME_KEY = 'namefi';
const DEFAULT_BRAND_KEY = 'namefi';

type CopyTarget = 'theme' | 'header' | 'result' | 'token';

function clampColor(value: number) {
  return Math.min(255, Math.max(0, value));
}

function shiftHexColor(hex: string, amount: number) {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return hex;
  const num = Number.parseInt(normalized, 16);
  const r = clampColor((num >> 16) + amount);
  const g = clampColor(((num >> 8) & 0xff) + amount);
  const b = clampColor((num & 0xff) + amount);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export default function App() {
  const [paymentRequired, setPaymentRequired] = useState<PaymentRequiredResponse | null>(null);
  const [themeKey, setThemeKey] = useState(DEFAULT_THEME_KEY);
  const [brandKey, setBrandKey] = useState(DEFAULT_BRAND_KEY);
  const [walletConnectProjectId, setWalletConnectProjectId] = useState('');
  const [showWalletConnectId, setShowWalletConnectId] = useState(false);
  const [resourceDescription, setResourceDescription] = useState(
    'Pay to view the protected resource',
  );
  const [showBalances, setShowBalances] = useState(true);

  const [customTheme, setCustomTheme] = useState<ThemeConfig>(themes[DEFAULT_THEME_KEY]);
  const [customBrandName, setCustomBrandName] = useState('Custom Studio');
  const [customBrandLogo, setCustomBrandLogo] = useState('');

  const [paymentResult, setPaymentResult] = useState<unknown>(null);
  const [paymentHeader, setPaymentHeader] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [copiedTarget, setCopiedTarget] = useState<CopyTarget | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadPaymentRequired = async () => {
      const res = await fetch(DEMO_URL, { headers: { Accept: 'application/json' } });
      if (!mounted) return;

      if (res.status === 402) {
        const header = res.headers.get('PAYMENT') || res.headers.get('X-PAYMENT');
        const decoded = decodeBase64Json<PaymentRequiredResponse>(header);
        if (decoded) {
          setPaymentRequired(decoded);
          return;
        }

        const body = (await res.json().catch(() => null)) as {
          paymentRequired?: PaymentRequiredResponse;
        } | null;
        if (body?.paymentRequired) {
          setPaymentRequired(body.paymentRequired);
        }
      }
    };

    loadPaymentRequired();
    return () => {
      mounted = false;
    };
  }, []);

  const resolvedTheme =
    themeKey === CUSTOM_THEME_KEY
      ? customTheme
      : themes[themeKey] || themes[DEFAULT_THEME_KEY];
  const resolvedBranding =
    brandKey === CUSTOM_BRAND_KEY
      ? {
          appName: customBrandName || 'Custom App',
          appLogo: customBrandLogo || undefined,
        }
      : brands[brandKey] || brands[DEFAULT_BRAND_KEY];

  const resolvedDescription = resourceDescription.trim() || 'Pay to view the protected resource';

  const walletConnect = useMemo<WalletConnectOptions | undefined>(() => {
    if (!walletConnectProjectId) return undefined;
    return {
      projectId: walletConnectProjectId,
      chains: [84532],
      metadata: {
        name: resolvedBranding.appName || 'x402 Demo',
        description: 'x402 paywall example app',
        url: window.location.origin,
        icons: resolvedBranding.appLogo ? [resolvedBranding.appLogo] : [],
      },
      rpcMap: {
        84532: 'https://sepolia.base.org',
      },
    };
  }, [walletConnectProjectId, resolvedBranding]);

  const paymentJson = useMemo(
    () => (paymentResult ? JSON.stringify(paymentResult, null, 2) : ''),
    [paymentResult],
  );

  const themeJson = useMemo(() => JSON.stringify(resolvedTheme, null, 2), [resolvedTheme]);

  const accessToken = useMemo(() => {
    if (!paymentResult || typeof paymentResult !== 'object') return null;
    return (paymentResult as { accessToken?: string }).accessToken || null;
  }, [paymentResult]);

  const radiusValue = Number.parseInt(resolvedTheme.borderRadius ?? '20', 10);

  const handleCopy = (text: string, target: CopyTarget) => {
    if (!text) return;
    void navigator.clipboard.writeText(text).then(() => {
      setCopiedTarget(target);
      setTimeout(() => setCopiedTarget(null), 1500);
    });
  };

  const handleThemeChange = (value: string) => {
    if (value === CUSTOM_THEME_KEY) {
      const baseTheme = themes[themeKey] || themes[DEFAULT_THEME_KEY];
      setCustomTheme(baseTheme);
    }
    setThemeKey(value);
  };

  const handleBrandChange = (value: string) => {
    if (value === CUSTOM_BRAND_KEY) {
      const baseBrand = brands[brandKey] || brands[DEFAULT_BRAND_KEY];
      setCustomBrandName(baseBrand?.appName || 'Custom Studio');
      setCustomBrandLogo(baseBrand?.appLogo || '');
    }
    setBrandKey(value);
  };

  const updateCustomTheme = (patch: Partial<ThemeConfig>) => {
    setCustomTheme((current: ThemeConfig) => ({ ...current, ...patch }));
  };

  const handleSuccess = (
    result: unknown,
    context: { response: Response; paymentHeader: string },
  ) => {
    setPaymentResult(result);
    setPaymentHeader(context.paymentHeader);
    setPaymentError(null);
  };

  const handleError = (error: Error) => {
    setPaymentError(error.message);
  };

  const clearOutput = () => {
    setPaymentResult(null);
    setPaymentHeader(null);
    setPaymentError(null);
  };

  return (
    <div className="app">
      <div className="app__header">
        <span className="badge">Local demo server: /api/x402/demo</span>
        <h1>x402 Paywall Studio</h1>
        <p>
          A modern x402 checkout. Customize the theme and branding,
          then handle the payment response in your own app logic.
        </p>
      </div>

      <div className="app__main">
        <div className="app__sidebar">
          <section className="panel">
            <div className="panel__header">
              <div>
                <h2 className="panel__title">Customize</h2>
                <p className="panel__subtitle">Theme, branding, and dev controls</p>
              </div>
              <button
                type="button"
                className="button button--ghost"
                onClick={() => handleCopy(themeJson, 'theme')}
              >
                {copiedTarget === 'theme' ? 'Copied' : 'Copy theme'}
              </button>
            </div>

            <div className="panel__section">
              <label className="control-label" htmlFor="theme">
                Theme preset
              </label>
              <select
                id="theme"
                value={themeKey}
                onChange={(e) => handleThemeChange(e.target.value)}
              >
                {Object.keys(themes).map((key) => (
                  <option key={key} value={key}>
                    {key.charAt(0).toUpperCase() + key.slice(1)}
                  </option>
                ))}
                <option value={CUSTOM_THEME_KEY}>Custom</option>
              </select>
            </div>

            {themeKey === CUSTOM_THEME_KEY && (
              <div className="panel__section">
                <div className="color-grid">
                  <label className="color-field">
                    <span>Background</span>
                    <div className="color-field__inputs">
                      <input
                        type="color"
                        value={customTheme.background}
                        onChange={(e) => updateCustomTheme({ background: e.target.value })}
                      />
                      <input
                        type="text"
                        value={customTheme.background}
                        onChange={(e) => updateCustomTheme({ background: e.target.value })}
                      />
                    </div>
                  </label>
                  <label className="color-field">
                    <span>Card</span>
                    <div className="color-field__inputs">
                      <input
                        type="color"
                        value={customTheme.card}
                        onChange={(e) => updateCustomTheme({ card: e.target.value })}
                      />
                      <input
                        type="text"
                        value={customTheme.card}
                        onChange={(e) => updateCustomTheme({ card: e.target.value })}
                      />
                    </div>
                  </label>
                  <label className="color-field">
                    <span>Text</span>
                    <div className="color-field__inputs">
                      <input
                        type="color"
                        value={customTheme.foreground}
                        onChange={(e) => updateCustomTheme({ foreground: e.target.value })}
                      />
                      <input
                        type="text"
                        value={customTheme.foreground}
                        onChange={(e) => updateCustomTheme({ foreground: e.target.value })}
                      />
                    </div>
                  </label>
                  <label className="color-field">
                    <span>Muted</span>
                    <div className="color-field__inputs">
                      <input
                        type="color"
                        value={customTheme.muted}
                        onChange={(e) => updateCustomTheme({ muted: e.target.value })}
                      />
                      <input
                        type="text"
                        value={customTheme.muted}
                        onChange={(e) => updateCustomTheme({ muted: e.target.value })}
                      />
                    </div>
                  </label>
                  <label className="color-field">
                    <span>Primary</span>
                    <div className="color-field__inputs">
                      <input
                        type="color"
                        value={customTheme.brandPrimary}
                        onChange={(e) =>
                          updateCustomTheme({
                            brandPrimary: e.target.value,
                            brandPrimaryHover: shiftHexColor(e.target.value, -18),
                          })
                        }
                      />
                      <input
                        type="text"
                        value={customTheme.brandPrimary}
                        onChange={(e) =>
                          updateCustomTheme({
                            brandPrimary: e.target.value,
                            brandPrimaryHover: shiftHexColor(e.target.value, -18),
                          })
                        }
                      />
                    </div>
                  </label>
                  <label className="color-field">
                    <span>Primary hover</span>
                    <div className="color-field__inputs">
                      <input
                        type="color"
                        value={customTheme.brandPrimaryHover}
                        onChange={(e) =>
                          updateCustomTheme({ brandPrimaryHover: e.target.value })
                        }
                      />
                      <input
                        type="text"
                        value={customTheme.brandPrimaryHover}
                        onChange={(e) =>
                          updateCustomTheme({ brandPrimaryHover: e.target.value })
                        }
                      />
                    </div>
                  </label>
                  <label className="color-field">
                    <span>Danger</span>
                    <div className="color-field__inputs">
                      <input
                        type="color"
                        value={customTheme.destructive}
                        onChange={(e) => updateCustomTheme({ destructive: e.target.value })}
                      />
                      <input
                        type="text"
                        value={customTheme.destructive}
                        onChange={(e) => updateCustomTheme({ destructive: e.target.value })}
                      />
                    </div>
                  </label>
                  <label className="color-field">
                    <span>Border</span>
                    <div className="color-field__inputs">
                      <input
                        type="text"
                        value={customTheme.border}
                        onChange={(e) => updateCustomTheme({ border: e.target.value })}
                      />
                    </div>
                  </label>
                </div>

                <label className="slider-field">
                  <span>Radius</span>
                  <div className="slider-field__inputs">
                    <input
                      type="range"
                      min="12"
                      max="28"
                      value={radiusValue}
                      onChange={(e) =>
                        updateCustomTheme({ borderRadius: `${e.target.value}px` })
                      }
                    />
                    <span className="slider-field__value">{radiusValue}px</span>
                  </div>
                </label>
              </div>
            )}

            <div className="panel__section">
              <label className="control-label" htmlFor="brand">
                Brand preset
              </label>
              <select
                id="brand"
                value={brandKey}
                onChange={(e) => handleBrandChange(e.target.value)}
              >
                {Object.keys(brands).map((key) => (
                  <option key={key} value={key}>
                    {key.charAt(0).toUpperCase() + key.slice(1)}
                  </option>
                ))}
                <option value={CUSTOM_BRAND_KEY}>Custom</option>
              </select>
            </div>

            {brandKey === CUSTOM_BRAND_KEY && (
              <div className="panel__section">
                <label className="control-label" htmlFor="brand-name">
                  App name
                </label>
                <input
                  id="brand-name"
                  type="text"
                  placeholder="Custom Studio"
                  value={customBrandName}
                  onChange={(e) => setCustomBrandName(e.target.value)}
                />
                <label className="control-label" htmlFor="brand-logo">
                  Logo URL (optional)
                </label>
                <input
                  id="brand-logo"
                  type="text"
                  placeholder="https://..."
                  value={customBrandLogo}
                  onChange={(e) => setCustomBrandLogo(e.target.value)}
                />
              </div>
            )}

            <div className="panel__section">
              <label className="control-label" htmlFor="resource">
                Resource description
              </label>
              <input
                id="resource"
                type="text"
                value={resourceDescription}
                onChange={(e) => setResourceDescription(e.target.value)}
              />
              <span className="helper">Shown in the paywall header.</span>
            </div>

            <div className="panel__section">
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={showBalances}
                  onChange={(e) => setShowBalances(e.target.checked)}
                />
                <span>Show balances</span>
              </label>
            </div>

            <div className="panel__section">
              <label className="control-label" htmlFor="walletconnect">
                WalletConnect Project ID (optional)
              </label>
              <div className="input-row">
                <input
                  id="walletconnect"
                  type={showWalletConnectId ? 'text' : 'password'}
                  placeholder="Paste Project ID to enable WalletConnect"
                  value={walletConnectProjectId}
                  onChange={(e) => setWalletConnectProjectId(e.target.value.trim())}
                />
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() => setShowWalletConnectId((value) => !value)}
                >
                  {showWalletConnectId ? 'Hide' : 'Show'}
                </button>
              </div>
              <span className="helper">
                Leave blank to show only the injected wallet button.
              </span>
            </div>
          </section>

          <section className="panel">
            <div className="panel__header">
              <div>
                <h2 className="panel__title">Developer output</h2>
                <p className="panel__subtitle">Handle results outside the paywall</p>
              </div>
              <button
                type="button"
                className="button button--ghost"
                onClick={clearOutput}
              >
                Clear
              </button>
            </div>

            {paymentError && (
              <div className="alert alert--error">
                <strong>Payment error</strong>
                <span>{paymentError}</span>
              </div>
            )}

            {!paymentHeader && !paymentJson && !paymentError && (
              <p className="helper">
                Complete a payment to see the response payload and headers.
              </p>
            )}

            {paymentHeader && (
              <div className="output-block">
                <div className="output-block__header">
                  <span>PAYMENT header</span>
                  <button
                    type="button"
                    className="button button--ghost"
                    onClick={() => handleCopy(paymentHeader, 'header')}
                  >
                    {copiedTarget === 'header' ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <code>{paymentHeader}</code>
              </div>
            )}

            {accessToken && (
              <div className="output-block">
                <div className="output-block__header">
                  <span>Access token</span>
                  <button
                    type="button"
                    className="button button--ghost"
                    onClick={() => handleCopy(accessToken, 'token')}
                  >
                    {copiedTarget === 'token' ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <code>{accessToken}</code>
              </div>
            )}

            {paymentJson && (
              <div className="output-block">
                <div className="output-block__header">
                  <span>Response JSON</span>
                  <button
                    type="button"
                    className="button button--ghost"
                    onClick={() => handleCopy(paymentJson, 'result')}
                  >
                    {copiedTarget === 'result' ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <pre>{paymentJson}</pre>
              </div>
            )}
          </section>
        </div>

        <div className="app__preview">
          {paymentRequired ? (
            <div className="preview-frame">
              <X402Paywall
                paymentRequired={paymentRequired}
                currentUrl={DEMO_URL}
                testnet
                chainConfigs={DEFAULT_CHAIN_CONFIGS}
                resourceDescription={resolvedDescription}
                theme={resolvedTheme}
                branding={resolvedBranding}
                walletConnect={walletConnect}
                showBalances={showBalances}
                onSuccess={handleSuccess}
                onError={handleError}
              />
            </div>
          ) : (
            <div className="panel">
              <h3>Waiting for payment requirements...</h3>
              <p className="helper">Start the dev server and refresh this page.</p>
            </div>
          )}
        </div>
      </div>

      <div className="footer">
        Demo server only: no real funds are transferred. Signatures are accepted as-is.
      </div>
    </div>
  );
}
