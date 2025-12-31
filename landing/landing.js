const card = document.querySelector('.mock__card');
const connectBtn = document.getElementById('demo-connect');
const walletConnectBtn = document.getElementById('demo-walletconnect');
const payBtn = document.getElementById('demo-pay');
const disconnectBtn = document.getElementById('demo-disconnect');
const resetBtn = document.getElementById('demo-reset');
const retryBtn = document.getElementById('demo-retry');
const walletConnectInput = document.getElementById('demo-wc-project');
const addressEl = document.getElementById('demo-address');
const signatureEl = document.getElementById('demo-signature');
const errorEl = document.getElementById('demo-error');
const processingTextEl = document.getElementById('demo-processing-text');

const DEMO_CHAIN = {
  chainId: 84532,
  chainName: 'Base Sepolia',
  rpcUrl: 'https://sepolia.base.org',
  blockExplorer: 'https://sepolia.basescan.org',
  usdcAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
};

const DEMO_PAYMENT = {
  amountAtomic: '2500',
  payTo: '0x000000000000000000000000000000000000dEaD',
  domain: {
    name: 'USD Coin',
    version: '2',
  },
};

let provider = null;
let connectedAddress = null;

if (walletConnectInput) {
  const stored = window.localStorage.getItem('x402-wc-project-id');
  if (stored) {
    walletConnectInput.value = stored;
  }
}

function setState(state) {
  if (!card) return;
  card.setAttribute('data-state', state);
}

function setProcessing(text) {
  if (processingTextEl) {
    processingTextEl.textContent = text;
  }
}

function showError(message) {
  if (errorEl) errorEl.textContent = message;
  setState('error');
}

function shortenAddress(address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function isMobile() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent,
  );
}

function hasInjectedWallet() {
  return typeof window.ethereum !== 'undefined';
}

async function ensureChain() {
  if (!provider) return;
  const targetHex = `0x${DEMO_CHAIN.chainId.toString(16)}`;
  const currentChainId = await provider.request({ method: 'eth_chainId' });
  if (currentChainId && currentChainId.toLowerCase() === targetHex.toLowerCase()) return;

  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: targetHex }],
    });
  } catch (err) {
    if (err && err.code === 4902) {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: targetHex,
            chainName: DEMO_CHAIN.chainName,
            nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
            rpcUrls: [DEMO_CHAIN.rpcUrl],
            blockExplorerUrls: [DEMO_CHAIN.blockExplorer],
          },
        ],
      });
    } else {
      throw err;
    }
  }
}

async function connectWallet() {
  if (!hasInjectedWallet()) {
    if (isMobile()) {
      window.location.href = `https://metamask.app.link/dapp/${window.location.host}${window.location.pathname}${window.location.search}`;
      return;
    }
    showError('No wallet detected. Install MetaMask to try the demo.');
    return;
  }

  try {
    setState('processing');
    setProcessing('Connecting wallet...');
    provider = window.ethereum;
    const accounts = await provider.request({ method: 'eth_requestAccounts' });
    if (!accounts || accounts.length === 0) {
      throw new Error('No accounts returned');
    }

    await ensureChain();
    connectedAddress = accounts[0];
    if (addressEl) addressEl.textContent = shortenAddress(connectedAddress);
    setState('connected');
  } catch (err) {
    if (err?.code === 4001) {
      showError('Connection rejected by user.');
    } else {
      showError(err?.message || 'Failed to connect wallet.');
    }
  }
}

async function signDemoPayment() {
  if (!provider || !connectedAddress) {
    showError('Connect your wallet first.');
    return;
  }

  try {
    setState('processing');
    setProcessing('Preparing signature...');

    const [{ createWalletClient, custom, getAddress, toHex }, { baseSepolia }] =
      await Promise.all([
        import('https://esm.sh/viem@2.43.3'),
        import('https://esm.sh/viem@2.43.3/chains'),
      ]);

    const from = getAddress(connectedAddress);
    const to = getAddress(DEMO_PAYMENT.payTo);
    const asset = getAddress(DEMO_CHAIN.usdcAddress);
    const value = BigInt(DEMO_PAYMENT.amountAtomic);
    const now = Math.floor(Date.now() / 1000);
    const validAfter = BigInt(now - 600);
    const validBefore = BigInt(now + 3600);
    const nonce = toHex(crypto.getRandomValues(new Uint8Array(32)));

    const domain = {
      name: DEMO_PAYMENT.domain.name,
      version: DEMO_PAYMENT.domain.version,
      chainId: DEMO_CHAIN.chainId,
      verifyingContract: asset,
    };

    const types = {
      TransferWithAuthorization: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' },
      ],
    };

    const message = { from, to, value, validAfter, validBefore, nonce };

    setProcessing('Please sign the demo authorization...');

    const walletClient = createWalletClient({
      account: from,
      chain: baseSepolia,
      transport: custom(provider),
    });

    const signature = await walletClient.signTypedData({
      account: from,
      domain,
      types,
      primaryType: 'TransferWithAuthorization',
      message,
    });

    if (signatureEl) signatureEl.textContent = signature;
    setState('success');
  } catch (err) {
    if (err?.code === 4001) {
      showError('Signature rejected by user.');
    } else {
      showError(err?.message || 'Signature failed.');
    }
  }
}

function disconnectDemo() {
  if (provider?.disconnect) {
    try {
      provider.disconnect();
    } catch {
      // ignore disconnect
    }
  }
  connectedAddress = null;
  provider = null;
  setState('connect');
}

function getWalletConnectProjectId() {
  const stored = window.localStorage.getItem('x402-wc-project-id');
  if (walletConnectInput && walletConnectInput.value.trim()) {
    const value = walletConnectInput.value.trim();
    window.localStorage.setItem('x402-wc-project-id', value);
    return value;
  }
  if (walletConnectInput && stored) {
    walletConnectInput.value = stored;
  }
  return stored || '';
}

connectBtn?.addEventListener('click', () => void connectWallet());
walletConnectBtn?.addEventListener('click', () => void connectWalletConnect());
payBtn?.addEventListener('click', () => void signDemoPayment());
disconnectBtn?.addEventListener('click', disconnectDemo);
resetBtn?.addEventListener('click', disconnectDemo);
retryBtn?.addEventListener('click', () => setState('connect'));

const heroButtons = document.querySelectorAll('.hero__actions .button');
heroButtons[0]?.addEventListener('click', () => {
  document.querySelector('#flow')?.scrollIntoView({ behavior: 'smooth' });
});

heroButtons[1]?.addEventListener('click', () => {
  document.querySelector('#themes')?.scrollIntoView({ behavior: 'smooth' });
});

const heroPayCta = document.getElementById('hero-pay-cta');
heroPayCta?.addEventListener('click', () => {
  document.querySelector('#flow')?.scrollIntoView({ behavior: 'smooth' });
});

async function connectWalletConnect() {
  const projectId = getWalletConnectProjectId();
  if (!projectId) {
    showError('Paste a WalletConnect Project ID to continue.');
    return;
  }

  try {
    setState('processing');
    setProcessing('Opening WalletConnect...');

    const { default: EthereumProvider } = await import(
      'https://esm.sh/@walletconnect/ethereum-provider@2.21.1'
    );

    provider = await EthereumProvider.init({
      projectId,
      chains: [DEMO_CHAIN.chainId],
      showQrModal: true,
      rpcMap: { [DEMO_CHAIN.chainId]: DEMO_CHAIN.rpcUrl },
    });

    if (provider.enable) {
      await provider.enable();
    } else if (provider.connect) {
      await provider.connect();
    }

    const accounts = await provider.request({ method: 'eth_requestAccounts' });
    if (!accounts || accounts.length === 0) {
      throw new Error('No accounts returned');
    }

    await ensureChain();
    connectedAddress = accounts[0];
    if (addressEl) addressEl.textContent = shortenAddress(connectedAddress);
    setState('connected');
  } catch (err) {
    if (err?.code === 4001) {
      showError('Connection rejected by user.');
    } else {
      showError(err?.message || 'Failed to connect via WalletConnect.');
    }
  }
}
