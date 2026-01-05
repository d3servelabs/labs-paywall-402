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

function buildPaymentRequiredResponse() {
  const encoded = Buffer.from(JSON.stringify(paymentRequired)).toString('base64');
  return new Response(
    JSON.stringify({
      status: 402,
      message: 'Payment Required',
      paymentRequired,
    }),
    {
      status: 402,
      headers: {
        'Content-Type': 'application/json',
        PAYMENT: encoded,
      },
    },
  );
}

function buildSuccessResponse(signature: string) {
  return new Response(
    JSON.stringify({
      ok: true,
      accessToken: 'demo-access-token',
      paidAt: new Date().toISOString(),
      signaturePreview: signature.slice(0, 24),
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    },
  );
}

function handleRequest(request: Request) {
  const header =
    request.headers.get('payment-signature') ||
    request.headers.get('x-payment-signature');

  if (!header) {
    return buildPaymentRequiredResponse();
  }

  return buildSuccessResponse(header);
}

export async function GET(request: Request) {
  return handleRequest(request);
}

export async function POST(request: Request) {
  return handleRequest(request);
}
