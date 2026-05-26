import type { ApprovalPayload } from "./validation";

const MAX_UINT64 = (1n << 64n) - 1n;

export function buildApproveIntegratorMessage(payload: ApprovalPayload, nonce: number, chainId: number): string {
  return [
    "Approve Integrator",
    "",
    `nonce: ${formatLighterUint64(nonce)}`,
    `account index: ${formatLighterUint64(payload.accountIndex)}`,
    `api key index: ${formatLighterUint64(payload.apiKeyIndex)}`,
    `integrator account index: ${formatLighterUint64(payload.integratorAccountIndex)}`,
    `max perps taker fee: ${formatLighterUint64(payload.maxPerpsTakerFee)}`,
    `max perps maker fee: ${formatLighterUint64(payload.maxPerpsMakerFee)}`,
    `max spot taker fee: ${formatLighterUint64(payload.maxSpotTakerFee)}`,
    `max spot maker fee: ${formatLighterUint64(payload.maxSpotMakerFee)}`,
    `approval expiry: ${formatLighterUint64(payload.approvalExpiry)}`,
    `chainId: ${formatLighterUint64(chainId)}`,
    "Only sign this message for a trusted client!"
  ].join("\n");
}

export function verifyApproveIntegratorMessage(
  payload: ApprovalPayload,
  nonce: number,
  chainId: number,
  messageToSign: string
): string {
  const expected = buildApproveIntegratorMessage(payload, nonce, chainId);
  if (messageToSign !== expected) {
    throw new Error("Lighter signer returned an unexpected L1 approval message. Wallet signing was blocked.");
  }
  return expected;
}

export function formatLighterUint64(value: number | bigint): string {
  const asBigInt = typeof value === "bigint" ? value : numberToBigInt(value);
  if (asBigInt < 0n || asBigInt > MAX_UINT64) {
    throw new Error(`Lighter message value is outside uint64 range: ${value.toString()}`);
  }
  return `0x${asBigInt.toString(16).padStart(16, "0")}`;
}

function numberToBigInt(value: number): bigint {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`Lighter message value must be a safe integer: ${value}`);
  }
  return BigInt(value);
}
