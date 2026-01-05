# x402 React Paywall

A generic, client-side paywall component for x402 payments that drops into React or Next.js apps.

## What it does

- Connects via wagmi connectors configured by your app
- Signs an EIP-3009 `TransferWithAuthorization` payload
- Submits the x402 payment header back to your resource URL
- Shows success state and lets you handle post-payment actions in `onSuccess`
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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { injected, walletConnect } from 'wagmi/connectors';
import { base, baseSepolia } from 'wagmi/chains';
import { X402Paywall, decodeBase64Json, type X402PaymentRequired } from 'x402-react-paywall';

const wagmiConfig = createConfig({
  chains: [base, baseSepolia],
  connectors: [
    injected(),
    walletConnect({ projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID! }),
  ],
  transports: {
    [base.id]: http('https://mainnet.base.org'),
    [baseSepolia.id]: http('https://sepolia.base.org'),
  },
});

const queryClient = new QueryClient();

export default function PaywalledReport() {
  const [paymentRequired, setPaymentRequired] = useState<X402PaymentRequired | null>(null);
  const resourceUrl = '/api/x402/analytics/report/example.com';

  useEffect(() => {
    const run = async () => {
      const res = await fetch(resourceUrl, { headers: { Accept: 'application/json' } });
      if (res.status === 402) {
        const header = res.headers.get('PAYMENT') || res.headers.get('X-PAYMENT');
        const decoded = decodeBase64Json<X402PaymentRequired>(header);
        if (decoded) {
          setPaymentRequired(decoded);
        }
      }
    };
    run();
  }, []);

  if (!paymentRequired) return <p>Loading...</p>;

  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={wagmiConfig}>
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
          onSuccess={(result) => {
            console.log('Payment response:', result);
          }}
        />
      </WagmiProvider>
    </QueryClientProvider>
  );
}
```

## Props

- `paymentRequired` (required): x402 payment required response JSON.
- `currentUrl` (required): URL to submit the payment signature to.
- `chainConfig` / `chainConfigs`: chain metadata needed for switching networks and balance checks.
- `acceptIndex`: choose which payment requirement to use if multiple are provided (default: `0`).
- `theme`: theme + branding config (colors plus optional `appName`/`appLogo`).
- `showBalances`: toggle the balances section.
- `requestInit`: pass custom fetch options (e.g. POST).
- `onSuccess`, `onError`: hooks for handling payment outcomes.

## Notes

- This component is client-only (`'use client'`) and must be rendered inside `WagmiProvider`.
- Your app should follow wagmi’s setup (including `QueryClientProvider`) and configure the connectors you want the paywall to render.
- Attribution: The `TransferWithAuthorization` (EIP-3009) signing flow references the [`namefi-astra`](https://github.com/d3servelabs/namefi-astra) implementation by GitHub user [`samishal1998`](https://github.com/samishal1998). We use wagmi here to handle EIP-712 typed-data signing and chain switching while the payload construction remains x402-specific.

## Example app

There is a working Next.js demo under `example/` with a mock 402 endpoint.

```bash
cd example
bun install
bun run dev
```
- Open http://localhost:3000.
- For server-side integration, make sure your 402 response includes the payment-required header (base64 encoded JSON) or pass the decoded JSON body into the component.
