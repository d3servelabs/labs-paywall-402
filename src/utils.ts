export function formatAmount(amount: number): string {
  if (Number.isNaN(amount)) return '0.00';
  if (amount >= 0.01) {
    return amount.toFixed(2);
  }
  const formatted = amount.toFixed(6);
  return formatted.replace(/\.?0+$/, '');
}

export function parseNetworkChainId(network?: string): number | null {
  if (!network) return null;
  const match = network.match(/eip155:(\d+)/i);
  if (!match) return null;
  return Number(match[1]);
}

export function toChainIdHex(chainId: number): string {
  return `0x${chainId.toString(16)}`;
}

export function decodeBase64Json<T>(value?: string | null): T | null {
  if (!value) return null;
  try {
    const json = atob(value);
    return JSON.parse(json) as T;
  } catch {
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }
}

export function encodeBase64Json(value: unknown): string {
  const json = JSON.stringify(value);
  return btoa(json);
}

export function shortenAddress(address: string): string {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function isMobileUserAgent(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent,
  );
}

export function hasInjectedWallet(): boolean {
  if (typeof window === 'undefined') return false;
  return typeof (window as typeof window & { ethereum?: unknown }).ethereum !== 'undefined';
}
