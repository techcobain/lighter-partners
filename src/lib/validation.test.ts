import { describe, expect, it } from "vitest";
import {
  LIGHTER_MAX_ACCOUNT_INDEX,
  LIGHTER_MAX_FEE,
  approvalRequiresWalletSignature,
  dateTimeLocalToMs,
  isEthereumAddress,
  isZeroFeeApprovalPayload,
  looksLikeLighterApiPrivateKey,
  parseInteger,
  validateApprovalForm,
  type ApprovalFormState
} from "./validation";

const validKey = `0x${"12".repeat(40)}`;

function baseForm(overrides: Partial<ApprovalFormState> = {}): ApprovalFormState {
  return {
    apiKeyIndex: "254",
    accountIndex: "42",
    integratorAccountIndex: "6",
    maxPerpsTakerFee: "1000",
    maxPerpsMakerFee: "1000",
    maxSpotTakerFee: "1000",
    maxSpotMakerFee: "1000",
    approvalExpiry: "2030-01-01T00:00",
    ...overrides
  };
}

describe("validation helpers", () => {
  it("parses safe integer strings only", () => {
    expect(parseInteger("255")).toBe(255);
    expect(parseInteger(" 001 ")).toBe(1);
    expect(parseInteger("-1")).toBeNull();
    expect(parseInteger("1.2")).toBeNull();
    expect(parseInteger(String(Number.MAX_SAFE_INTEGER + 10))).toBeNull();
  });

  it("validates Lighter private key shape", () => {
    expect(looksLikeLighterApiPrivateKey(validKey)).toBe(true);
    expect(looksLikeLighterApiPrivateKey("12".repeat(40))).toBe(true);
    expect(looksLikeLighterApiPrivateKey(`0x${"12".repeat(39)}`)).toBe(false);
    expect(looksLikeLighterApiPrivateKey(`0x${"12".repeat(41)}`)).toBe(false);
    expect(looksLikeLighterApiPrivateKey("not-secret")).toBe(false);
  });

  it("validates Ethereum lookup addresses", () => {
    expect(isEthereumAddress("0x0000000000000000000000000000000000000000")).toBe(true);
    expect(isEthereumAddress(" 0xabcdefABCDEFabcdefABCDEFabcdefABCDEFabcd ")).toBe(true);
    expect(isEthereumAddress("0x1234")).toBe(false);
    expect(isEthereumAddress("not-address")).toBe(false);
  });

  it("converts datetime-local values to milliseconds", () => {
    expect(dateTimeLocalToMs("2030-01-01T00:00")).toEqual(expect.any(Number));
    expect(dateTimeLocalToMs("")).toBeNull();
  });

  it("returns an approve payload for valid values", () => {
    const result = validateApprovalForm(baseForm(), "approve", validKey, Date.UTC(2026, 0, 1));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload).toMatchObject({
        accountIndex: 42,
        integratorAccountIndex: 6,
        apiKeyIndex: 254,
        apiPrivateKey: validKey,
        maxPerpsTakerFee: 1000
      });
      expect(result.payload.approvalExpiry).toBeGreaterThan(Date.UTC(2026, 0, 1));
    }
  });

  it("allows zero-fee approvals with a future non-zero expiry to skip wallet signing", () => {
    const result = validateApprovalForm(
      baseForm({
        maxPerpsTakerFee: "0",
        maxPerpsMakerFee: "0",
        maxSpotTakerFee: "0",
        maxSpotMakerFee: "0"
      }),
      "approve",
      validKey,
      Date.UTC(2026, 0, 1)
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(isZeroFeeApprovalPayload(result.payload)).toBe(true);
      expect(approvalRequiresWalletSignature("approve", result.payload)).toBe(false);
    }
  });

  it("forces revoke payload fees and expiry to zero", () => {
    const result = validateApprovalForm(baseForm({ approvalExpiry: "2020-01-01T00:00" }), "revoke", validKey, Date.UTC(2026, 0, 1));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.maxPerpsTakerFee).toBe(0);
      expect(result.payload.maxPerpsMakerFee).toBe(0);
      expect(result.payload.maxSpotTakerFee).toBe(0);
      expect(result.payload.maxSpotMakerFee).toBe(0);
      expect(result.payload.approvalExpiry).toBe(0);
      expect(isZeroFeeApprovalPayload(result.payload)).toBe(false);
      expect(approvalRequiresWalletSignature("revoke", result.payload)).toBe(false);
    }
  });

  it("rejects API key index 255", () => {
    const result = validateApprovalForm(baseForm({ apiKeyIndex: "255" }), "approve", validKey, Date.UTC(2026, 0, 1));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain("API key index must be an integer from 0 to 254.");
    }
  });

  it("enforces fee and account SDK caps", () => {
    const result = validateApprovalForm(
      baseForm({
        accountIndex: String(LIGHTER_MAX_ACCOUNT_INDEX + 1),
        integratorAccountIndex: String(LIGHTER_MAX_ACCOUNT_INDEX + 1),
        maxPerpsTakerFee: String(LIGHTER_MAX_FEE + 1)
      }),
      "approve",
      validKey,
      Date.UTC(2026, 0, 1)
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toEqual(
        expect.arrayContaining([
          `Lighter account index must be an integer from 0 to ${LIGHTER_MAX_ACCOUNT_INDEX}.`,
          `Integrator account index must be an integer from 0 to ${LIGHTER_MAX_ACCOUNT_INDEX}.`,
          `Perps taker fee must be an integer from 0 to ${LIGHTER_MAX_FEE}.`
        ])
      );
    }
  });

  it("keeps revoke expiry zero but requires future expiry for approve", () => {
    const approve = validateApprovalForm(baseForm({ approvalExpiry: "2020-01-01T00:00" }), "approve", validKey, Date.UTC(2026, 0, 1));
    const revoke = validateApprovalForm(baseForm({ approvalExpiry: "2020-01-01T00:00" }), "revoke", validKey, Date.UTC(2026, 0, 1));

    expect(approve.ok).toBe(false);
    expect(revoke.ok).toBe(true);
    if (revoke.ok) {
      expect(revoke.payload.approvalExpiry).toBe(0);
    }
  });

  it("rejects invalid approve values", () => {
    const result = validateApprovalForm(
      baseForm({
        apiKeyIndex: "300",
        accountIndex: "-1",
        maxPerpsTakerFee: "1000001",
        approvalExpiry: "2020-01-01T00:00"
      }),
      "approve",
      "0x1234",
      Date.UTC(2026, 0, 1)
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThanOrEqual(4);
    }
  });
});
