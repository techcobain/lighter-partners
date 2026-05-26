export type LighterNetworkKey = "mainnet" | "testnet";

export type LighterNetwork = {
  key: LighterNetworkKey;
  label: string;
  chainId: number;
  apiUrl: string;
};

export const LIGHTER_NETWORKS: Record<LighterNetworkKey, LighterNetwork> = {
  mainnet: {
    key: "mainnet",
    label: "Mainnet",
    chainId: 304,
    apiUrl: "https://mainnet.zklighter.elliot.ai"
  },
  testnet: {
    key: "testnet",
    label: "Testnet",
    chainId: 300,
    apiUrl: "https://testnet.zklighter.elliot.ai"
  }
};

const defaultExpiry = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
defaultExpiry.setSeconds(0, 0);

export const DEFAULT_APPROVAL_FORM = {
  apiKeyIndex: "",
  accountIndex: "",
  integratorAccountIndex: import.meta.env.VITE_LIGHTER_DEFAULT_INTEGRATOR_ACCOUNT_INDEX ?? "",
  maxPerpsTakerFee: import.meta.env.VITE_LIGHTER_DEFAULT_PERPS_TAKER_FEE ?? "1000",
  maxPerpsMakerFee: import.meta.env.VITE_LIGHTER_DEFAULT_PERPS_MAKER_FEE ?? "1000",
  maxSpotTakerFee: import.meta.env.VITE_LIGHTER_DEFAULT_SPOT_TAKER_FEE ?? "1000",
  maxSpotMakerFee: import.meta.env.VITE_LIGHTER_DEFAULT_SPOT_MAKER_FEE ?? "1000",
  approvalExpiry: toDateTimeLocal(defaultExpiry)
};

export function toDateTimeLocal(date: Date): string {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}
