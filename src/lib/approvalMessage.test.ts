import { describe, expect, it } from "vitest";
import { buildApproveIntegratorMessage, formatLighterUint64, verifyApproveIntegratorMessage } from "./approvalMessage";
import type { ApprovalPayload } from "./validation";

const payload: ApprovalPayload = {
  apiKeyIndex: 7,
  apiPrivateKey: `0x${"12".repeat(40)}`,
  accountIndex: 42,
  integratorAccountIndex: 6,
  maxPerpsTakerFee: 1000,
  maxPerpsMakerFee: 2000,
  maxSpotTakerFee: 3000,
  maxSpotMakerFee: 4000,
  approvalExpiry: 1_893_456_000_000
};

describe("approval message verification", () => {
  it("formats Lighter uint64 values like the Go SDK", () => {
    expect(formatLighterUint64(0)).toBe("0x0000000000000000");
    expect(formatLighterUint64(304)).toBe("0x0000000000000130");
    expect(formatLighterUint64(281_474_976_710_654)).toBe("0x0000fffffffffffe");
  });

  it("rebuilds the exact approve-integrator L1 message", () => {
    expect(buildApproveIntegratorMessage(payload, 9, 304)).toBe(
      [
        "Approve Integrator",
        "",
        "nonce: 0x0000000000000009",
        "account index: 0x000000000000002a",
        "api key index: 0x0000000000000007",
        "integrator account index: 0x0000000000000006",
        "max perps taker fee: 0x00000000000003e8",
        "max perps maker fee: 0x00000000000007d0",
        "max spot taker fee: 0x0000000000000bb8",
        "max spot maker fee: 0x0000000000000fa0",
        "approval expiry: 0x000001b8dac5b400",
        "chainId: 0x0000000000000130",
        "Only sign this message for a trusted client!"
      ].join("\n")
    );
  });

  it("rejects a tampered WASM message before wallet signing", () => {
    const expected = buildApproveIntegratorMessage(payload, 9, 304);
    expect(() => verifyApproveIntegratorMessage(payload, 9, 304, expected.replace("0000000000000006", "0000000000000007"))).toThrow(
      "Wallet signing was blocked"
    );
  });
});
