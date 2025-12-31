# Example App

This Vite app demonstrates a full x402 flow using the local dev server middleware.

## Run

```bash
cd example
bun install
bun run dev
```

Then open http://localhost:5173.

## How it works

- `vite.config.ts` defines a mock `/api/x402/demo` endpoint.
- The app fetches `/api/x402/demo`. When it receives 402, it reads the `PAYMENT` header.
- The `X402Paywall` component connects a wallet, signs, and replays the request with `PAYMENT-SIGNATURE` headers.
- The dev server accepts the signature and returns a JSON payload.

WalletConnect

Paste a WalletConnect Project ID into the input to enable the WalletConnect button.
