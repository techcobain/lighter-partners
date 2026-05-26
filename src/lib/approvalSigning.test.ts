import { describe, expect, it, vi } from "vitest";
import { buildApproveIntegratorMessage } from "./approvalMessage";
import { signVerifiedApprovalMessage } from "./approvalSigning";
import type { ApprovalPayload } from "./validation";
import type { EthereumProvider } from "./wallet";

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

describe("verified approval wallet signing", () => {
  it("does not call personal_sign when the WASM message was tampered", async () => {
    const request = vi.fn();
    const provider: EthereumProvider = { request };
    const message = buildApproveIntegratorMessage(payload, 9, 304).replace("account index: 0x000000000000002a", "account index: 0x000000000000002b");

    await expect(signVerifiedApprovalMessage(provider, "0x0000000000000000000000000000000000000000", payload, 9, 304, message)).rejects.toThrow(
      "Wallet signing was blocked"
    );
    expect(request).not.toHaveBeenCalled();
  });

  it("calls personal_sign with the verified exact message", async () => {
    const request = vi.fn().mockResolvedValue("0xsig");
    const provider: EthereumProvider = { request };
    const message = buildApproveIntegratorMessage(payload, 9, 304);

    await expect(signVerifiedApprovalMessage(provider, "0x0000000000000000000000000000000000000000", payload, 9, 304, message)).resolves.toBe(
      "0xsig"
    );
    expect(request).toHaveBeenCalledWith({
      method: "personal_sign",
      params: [message, "0x0000000000000000000000000000000000000000"]
    });
  });
});
