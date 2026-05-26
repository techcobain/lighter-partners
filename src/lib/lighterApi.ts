import type { ApprovalPayload } from "./validation";

export type LighterAccount = {
  index: number;
  l1_address?: string;
  account_type?: number;
  status?: number;
  available_balance?: string;
};

export type ApprovedIntegrator = {
  account_index: number;
  name: string;
  max_perps_taker_fee: number;
  max_perps_maker_fee: number;
  max_spot_taker_fee: number;
  max_spot_maker_fee: number;
  approval_expiry: number;
};

type AccountsByAddressResponse = {
  code?: number;
  message?: string;
  sub_accounts?: LighterAccount[];
};

type DetailedAccountsResponse = {
  code?: number;
  message?: string;
  accounts?: Array<{
    approved_integrators?: ApprovedIntegrator[];
  }>;
};

type ApiKeyResponse = {
  code?: number;
  message?: string;
  api_keys?: Array<{
    account_index: number;
    api_key_index: number;
    nonce: number;
    public_key: string;
  }>;
};

type NextNonceResponse = {
  code?: number;
  message?: string;
  nonce?: number;
};

export type SendTxResponse = {
  code?: number;
  message?: string;
  [key: string]: unknown;
};

export async function fetchAccountsByL1Address(apiUrl: string, l1Address: string): Promise<LighterAccount[]> {
  const url = new URL("/api/v1/accountsByL1Address", apiUrl);
  url.searchParams.set("l1_address", l1Address);

  const response = await fetch(url);
  const body = (await response.json()) as AccountsByAddressResponse;
  if (!response.ok || (body.code !== undefined && body.code !== 200)) {
    throw new Error(body.message || `Lighter account lookup failed with status ${response.status}.`);
  }

  return (body.sub_accounts ?? []).filter((account) => Number.isSafeInteger(Number(account.index)));
}

export async function fetchApprovedIntegrators(apiUrl: string, accountIndex: number): Promise<ApprovedIntegrator[]> {
  const url = new URL("/api/v1/account", apiUrl);
  url.searchParams.set("by", "index");
  url.searchParams.set("value", String(accountIndex));
  url.searchParams.set("active_only", "true");

  const response = await fetch(url);
  const body = (await response.json()) as DetailedAccountsResponse;
  if (!response.ok || (body.code !== undefined && body.code !== 200)) {
    throw new Error(body.message || `Lighter account detail lookup failed with status ${response.status}.`);
  }

  return body.accounts?.[0]?.approved_integrators ?? [];
}

export async function fetchApiKeyPublicKey(apiUrl: string, accountIndex: number, apiKeyIndex: number): Promise<string> {
  const url = new URL("/api/v1/apikeys", apiUrl);
  url.searchParams.set("account_index", String(accountIndex));
  url.searchParams.set("api_key_index", String(apiKeyIndex));

  const response = await fetch(url);
  const body = (await response.json()) as ApiKeyResponse;
  if (!response.ok || (body.code !== undefined && body.code !== 200)) {
    throw new Error(body.message || `Lighter API key lookup failed with status ${response.status}.`);
  }

  const publicKey = body.api_keys?.[0]?.public_key;
  if (!publicKey) {
    throw new Error(`No Lighter API key found for account ${accountIndex}, key index ${apiKeyIndex}.`);
  }
  return publicKey;
}

export async function fetchNextNonce(apiUrl: string, accountIndex: number, apiKeyIndex: number): Promise<number> {
  const url = new URL("/api/v1/nextNonce", apiUrl);
  url.searchParams.set("account_index", String(accountIndex));
  url.searchParams.set("api_key_index", String(apiKeyIndex));

  const response = await fetch(url);
  const body = (await response.json()) as NextNonceResponse;
  if (!response.ok || (body.code !== undefined && body.code !== 200)) {
    throw new Error(body.message || `Lighter nonce lookup failed with status ${response.status}.`);
  }

  const nonce = body.nonce;
  if (typeof nonce !== "number" || !Number.isSafeInteger(nonce)) {
    throw new Error("Lighter nonce lookup returned an invalid nonce.");
  }
  return nonce;
}

export async function sendApprovalTx(apiUrl: string, txType: number, txInfo: string): Promise<SendTxResponse> {
  const url = new URL("/api/v1/sendTx", apiUrl);
  const body = new URLSearchParams({
    tx_type: String(txType),
    tx_info: txInfo,
    price_protection: "true"
  });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body
  });
  const result = (await response.json()) as SendTxResponse;
  if (!response.ok || (result.code !== undefined && result.code !== 200)) {
    throw new Error(result.message || `Lighter transaction failed with status ${response.status}.`);
  }
  return result;
}

export function normalizePublicKey(publicKey: string): string {
  return publicKey.trim().replace(/^0x/i, "").toLowerCase();
}

export function withL1Signature(txInfo: string, l1Signature: string): string {
  const parsed = JSON.parse(txInfo) as Record<string, unknown>;
  parsed.L1Sig = l1Signature;
  return JSON.stringify(parsed);
}

export function approvalPayloadSummary(payload: ApprovalPayload): Record<string, number> {
  return {
    accountIndex: payload.accountIndex,
    integratorAccountIndex: payload.integratorAccountIndex,
    maxPerpsTakerFee: payload.maxPerpsTakerFee,
    maxPerpsMakerFee: payload.maxPerpsMakerFee,
    maxSpotTakerFee: payload.maxSpotTakerFee,
    maxSpotMakerFee: payload.maxSpotMakerFee,
    approvalExpiry: payload.approvalExpiry
  };
}
