# Example App

This Next.js app demonstrates a full x402 flow using a local API route.

## Run

```bash
cd example
bun install
bun run dev
```

Then open http://localhost:3000.

## How it works

- `pages/api/x402/demo.ts` serves a mock 402 endpoint at `/api/x402/demo`.
- The app fetches `/api/x402/demo`. When it receives 402, it reads the `PAYMENT` header.
- The `X402Paywall` component connects a wallet, signs, and replays the request with `PAYMENT-SIGNATURE` headers.
- The API route validates the signature header and returns a JSON payload.

WalletConnect

Set `NEXT_PUBLIC_WC_PROJECT_ID` in your environment to enable the WalletConnect connector.
