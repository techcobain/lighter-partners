export type EthereumProvider = {
  isMetaMask?: boolean;
  isRabby?: boolean;
  request<T = unknown>(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<T>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
};

export type WalletOption = {
  id: string;
  name: string;
  icon?: string;
  provider: EthereumProvider;
};

type Eip6963ProviderDetail = {
  info: {
    uuid: string;
    name: string;
    icon?: string;
    rdns?: string;
  };
  provider: EthereumProvider;
};

declare global {
  interface WindowEventMap {
    "eip6963:announceProvider": CustomEvent<Eip6963ProviderDetail>;
  }

  interface Window {
    ethereum?: EthereumProvider & {
      providers?: EthereumProvider[];
    };
  }
}

export async function discoverWallets(): Promise<WalletOption[]> {
  const options: WalletOption[] = [];

  const addWallet = (option: WalletOption) => {
    const key = walletKey(option);
    if (options.some((existing) => existing.provider === option.provider || walletKey(existing) === key)) {
      return;
    }
    options.push(option);
  };

  const handler = (event: CustomEvent<Eip6963ProviderDetail>) => {
    addWallet({
      id: event.detail.info.uuid,
      name: event.detail.info.name,
      icon: event.detail.info.icon,
      provider: event.detail.provider
    });
  };

  window.addEventListener("eip6963:announceProvider", handler);
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  await new Promise((resolve) => window.setTimeout(resolve, 250));
  window.removeEventListener("eip6963:announceProvider", handler);

  const injected = window.ethereum?.providers ?? (window.ethereum ? [window.ethereum] : []);
  for (const provider of injected) {
    const name = provider.isRabby ? "Rabby" : provider.isMetaMask ? "MetaMask" : "Injected wallet";
    addWallet({
      id: name.toLowerCase(),
      name,
      provider
    });
  }

  return options.sort((a, b) => walletRank(a.name) - walletRank(b.name));
}

export async function connectWallet(provider: EthereumProvider): Promise<string> {
  const accounts = await provider.request<string[]>({ method: "eth_requestAccounts" });
  const first = accounts[0];
  if (!first) {
    throw new Error("Wallet did not return an account.");
  }
  return first;
}

export async function personalSign(provider: EthereumProvider, address: string, message: string): Promise<string> {
  return provider.request<string>({
    method: "personal_sign",
    params: [message, address]
  });
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function walletRank(name: string): number {
  const normalized = name.toLowerCase();
  if (normalized.includes("rabby")) {
    return 0;
  }
  if (normalized.includes("metamask")) {
    return 1;
  }
  return 2;
}

function walletKey(option: WalletOption): string {
  const normalized = option.name.toLowerCase();
  if (option.provider.isRabby || normalized.includes("rabby")) {
    return "rabby";
  }
  if (option.provider.isMetaMask || normalized.includes("metamask")) {
    return "metamask";
  }
  return normalized.replace(/\s+/g, "-");
}
