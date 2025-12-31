# x402 React Paywall

A generic, client-side paywall component for x402 payments that drops into React or Next.js apps. It reproduces the EIP-3009 signing flow from the reference HTML paywall, but wraps it in a composable React component.

## What it does

- Connects to an injected wallet (MetaMask) and WalletConnect
- Signs an EIP-3009 `TransferWithAuthorization` payload
- Submits the x402 payment header back to your resource URL
- Shows success state and optional redirect (handle the response in `onSuccess`)
- (Optional) Fetches USDC balances across accepted chains

## Install / import

This repo is source-only. Consume it as a workspace package or copy `src/` into your app.

Make sure to import the CSS once at the app root:

```ts
import 'x402-react-paywall/styles.css';
```

## Usage (React / Next.js)

```tsx
'use client';

import { useEffect, useState } from 'react';
import { X402Paywall, decodeBase64Json, type PaymentRequiredResponse } from 'x402-react-paywall';

export default function PaywalledReport() {
  const [paymentRequired, setPaymentRequired] = useState<PaymentRequiredResponse | null>(null);
  const resourceUrl = '/api/x402/analytics/report/example.com';

  useEffect(() => {
    const run = async () => {
      const res = await fetch(resourceUrl, { headers: { Accept: 'application/json' } });
      if (res.status === 402) {
        const header = res.headers.get('PAYMENT') || res.headers.get('X-PAYMENT');
        const decoded = decodeBase64Json<PaymentRequiredResponse>(header);
        if (decoded) {
          setPaymentRequired(decoded);
        }
      }
    };
    run();
  }, []);

  if (!paymentRequired) return <p>Loading...</p>;

  return (
    <X402Paywall
      paymentRequired={paymentRequired}
      currentUrl={resourceUrl}
      testnet
      chainConfigs={{
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
      }}
      resourceDescription="Pay to view the protected resource"
      walletConnect={{
        projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID!,
        metadata: {
          name: 'x402 Demo',
          description: 'x402 paywall demo',
          url: 'https://example.com',
          icons: ['https://example.com/icon.png'],
        },
      }}
      successRedirectUrl="/report"
      onSuccess={(result) => {
        console.log('Payment response:', result);
      }}
    />
  );
}
```

## Props

- `paymentRequired` (required): x402 payment required response JSON.
- `currentUrl` (required): URL to submit the payment signature to.
- `chainConfig` / `chainConfigs`: chain metadata needed for switching networks and balance checks.
- `acceptIndex`: choose which payment requirement to use if multiple are provided (default: `0`).
- `walletConnect`: full WalletConnect configuration (recommended).
- `walletConnectProjectId`: legacy shortcut (still supported).
- `successRedirectUrl`, `successRedirectDelaySeconds`, `autoSuccessRedirect`, `successRedirectBtnLabel`: optional success redirect behavior (can be overridden by `X-PAYWALL-REDIRECT-OPTIONS` header).
- `showBalances`: toggle the balances section.
- `requestInit`: pass custom fetch options (e.g. POST).
- `onSuccess`, `onError`: hooks for handling payment outcomes.

## Notes

- This component is client-only (`'use client'`).
- WalletConnect requires a Project ID from WalletConnect Cloud.

## Example app

There is a working Vite demo under `example/` with a mock 402 endpoint.

```bash
cd example
bun install
bun run dev
```
- For server-side integration, make sure your 402 response includes the payment-required header (base64 encoded JSON) or pass the decoded JSON body into the component.
