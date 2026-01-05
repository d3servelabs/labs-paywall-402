import type { NextApiRequest, NextApiResponse } from 'next';

const paymentRequired = {
  x402Version: 2,
  accepts: [
    {
      scheme: 'exact',
      network: 'eip155:84532',
      maxAmountRequired: '2500',
      resource: '/api/x402/demo',
      description: 'Pay to view the protected resource',
      mimeType: 'application/json',
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

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const header = req.headers['payment-signature'] || req.headers['x-payment-signature'];
  const signature = Array.isArray(header) ? header[0] : header;

  if (!signature) {
    const encoded = Buffer.from(JSON.stringify(paymentRequired)).toString('base64');
    res.status(402);
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

  res.status(200);
  res.setHeader('Content-Type', 'application/json');
  res.end(
    JSON.stringify({
      ok: true,
      accessToken: 'demo-access-token',
      paidAt: new Date().toISOString(),
      signaturePreview: String(signature).slice(0, 24),
    }),
  );
}
