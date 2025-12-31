import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const paymentRequired = {
  x402Version: 2,
  resource: {
    url: '/api/x402/demo',
    description: 'Pay to view the protected resource',
    mimeType: 'application/json',
  },
  accepts: [
    {
      scheme: 'exact',
      network: 'eip155:84532',
      amount: '2500',
      payTo: '0x1b0f291c8fFebE891886351CDfF8A304a840C8Ad',
      asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      maxTimeoutSeconds: 3600,
      extra: {
        name: 'USD Coin',
        version: '2',
      },
    },
  ],
};

function x402DemoMiddleware() {
  return {
    name: 'x402-demo-middleware',
    configureServer(server) {
      server.middlewares.use('/api/x402/demo', (req, res) => {
        const paymentHeader =
          req.headers['payment-signature'] || req.headers['x-payment-signature'];

        if (!paymentHeader) {
          const encoded = Buffer.from(JSON.stringify(paymentRequired)).toString(
            'base64',
          );
          res.statusCode = 402;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('PAYMENT', encoded);
          res.end(
            JSON.stringify({
              status: 402,
              message: 'Payment Required',
              paymentRequired,
            }),
          );
          return;
        }

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            ok: true,
            accessToken: 'demo-access-token',
            paidAt: new Date().toISOString(),
            signaturePreview: String(paymentHeader).slice(0, 24),
          }),
        );
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), x402DemoMiddleware()],
  resolve: {
    alias: {
      '@x402/paywall': path.resolve(__dirname, '../src/index.ts'),
    },
  },
  server: {
    port: 5173,
    fs: {
      allow: [path.resolve(__dirname, '..')],
    },
  },
});
