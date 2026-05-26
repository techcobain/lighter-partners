export type ApprovalFormState = {
  apiKeyIndex: string;
  accountIndex: string;
  integratorAccountIndex: string;
  maxPerpsTakerFee: string;
  maxPerpsMakerFee: string;
  maxSpotTakerFee: string;
  maxSpotMakerFee: string;
  approvalExpiry: string;
};

export type ApprovalAction = "approve" | "revoke";

export type ApprovalPayload = {
  apiKeyIndex: number;
  apiPrivateKey: string;
  accountIndex: number;
  integratorAccountIndex: number;
  maxPerpsTakerFee: number;
  maxPerpsMakerFee: number;
  maxSpotTakerFee: number;
  maxSpotMakerFee: number;
  approvalExpiry: number;
};

export type ValidationResult =
  | { ok: true; payload: ApprovalPayload }
  | { ok: false; errors: string[] };

const UINT32_MAX = 4_294_967_295;
export const LIGHTER_PRIVATE_KEY_BYTES = 40;
export const LIGHTER_PRIVATE_KEY_HEX_LENGTH = LIGHTER_PRIVATE_KEY_BYTES * 2;
export const LIGHTER_MAX_API_KEY_INDEX = 254;
export const LIGHTER_MAX_ACCOUNT_INDEX = 281_474_976_710_654;
export const LIGHTER_MAX_FEE = 1_000_000;
export const LIGHTER_MAX_TIMESTAMP = 281_474_976_710_655;

export function validateApprovalForm(
  form: ApprovalFormState,
  action: ApprovalAction,
  apiPrivateKey: string,
  now = Date.now()
): ValidationResult {
  const errors: string[] = [];
  const apiKeyIndex = parseInteger(form.apiKeyIndex);
  const accountIndex = parseInteger(form.accountIndex);
  const integratorAccountIndex = parseInteger(form.integratorAccountIndex);
  const maxPerpsTakerFee = action === "revoke" ? 0 : parseInteger(form.maxPerpsTakerFee);
  const maxPerpsMakerFee = action === "revoke" ? 0 : parseInteger(form.maxPerpsMakerFee);
  const maxSpotTakerFee = action === "revoke" ? 0 : parseInteger(form.maxSpotTakerFee);
  const maxSpotMakerFee = action === "revoke" ? 0 : parseInteger(form.maxSpotMakerFee);
  const approvalExpiry = action === "revoke" ? 0 : dateTimeLocalToMs(form.approvalExpiry);

  if (apiKeyIndex === null || apiKeyIndex < 0 || apiKeyIndex > LIGHTER_MAX_API_KEY_INDEX) {
    errors.push(`API key index must be an integer from 0 to ${LIGHTER_MAX_API_KEY_INDEX}.`);
  }
  if (!looksLikeLighterApiPrivateKey(apiPrivateKey)) {
    errors.push(`Lighter API private key must be exactly ${LIGHTER_PRIVATE_KEY_BYTES} bytes of hex, with optional 0x prefix.`);
  }
  if (!isLighterAccountIndex(accountIndex)) {
    errors.push(`Lighter account index must be an integer from 0 to ${LIGHTER_MAX_ACCOUNT_INDEX}.`);
  }
  if (!isLighterAccountIndex(integratorAccountIndex)) {
    errors.push(`Integrator account index must be an integer from 0 to ${LIGHTER_MAX_ACCOUNT_INDEX}.`);
  }

  if (action === "approve") {
    for (const [label, value] of [
      ["Perps taker fee", maxPerpsTakerFee],
      ["Perps maker fee", maxPerpsMakerFee],
      ["Spot taker fee", maxSpotTakerFee],
      ["Spot maker fee", maxSpotMakerFee]
    ] as const) {
      if (value === null || value < 0 || value > LIGHTER_MAX_FEE || value > UINT32_MAX) {
        errors.push(`${label} must be an integer from 0 to ${LIGHTER_MAX_FEE}.`);
      }
    }

    if (approvalExpiry === null || approvalExpiry <= now) {
      errors.push("Approval expiry must be a future date and time.");
    } else if (approvalExpiry > LIGHTER_MAX_TIMESTAMP) {
      errors.push(`Approval expiry must not exceed ${LIGHTER_MAX_TIMESTAMP}.`);
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    payload: {
      apiKeyIndex: apiKeyIndex!,
      apiPrivateKey: apiPrivateKey.trim(),
      accountIndex: accountIndex!,
      integratorAccountIndex: integratorAccountIndex!,
      maxPerpsTakerFee: maxPerpsTakerFee!,
      maxPerpsMakerFee: maxPerpsMakerFee!,
      maxSpotTakerFee: maxSpotTakerFee!,
      maxSpotMakerFee: maxSpotMakerFee!,
      approvalExpiry: approvalExpiry!
    }
  };
}

export function parseInteger(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function looksLikeLighterApiPrivateKey(value: string): boolean {
  const trimmed = value.trim();
  const hex = trimmed.startsWith("0x") ? trimmed.slice(2) : trimmed;
  return hex.length === LIGHTER_PRIVATE_KEY_HEX_LENGTH && /^[0-9a-fA-F]+$/.test(hex);
}

export function isEthereumAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value.trim());
}

export function dateTimeLocalToMs(value: string): number | null {
  if (!value.trim()) {
    return null;
  }
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function isLighterAccountIndex(value: number | null): value is number {
  return value !== null && value >= 0 && value <= LIGHTER_MAX_ACCOUNT_INDEX && Number.isSafeInteger(value);
}
