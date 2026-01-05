import type { Metadata } from 'next';

import 'x402-react-paywall/styles.css';
import './globals.css';

import Providers from './providers';

export const metadata: Metadata = {
  title: 'x402 Paywall Studio',
  description: 'Interactive demo for the x402 React paywall component.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
