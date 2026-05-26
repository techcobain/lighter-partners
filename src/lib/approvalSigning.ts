import { verifyApproveIntegratorMessage } from "./approvalMessage";
import type { ApprovalPayload } from "./validation";
import { personalSign, type EthereumProvider } from "./wallet";

export async function signVerifiedApprovalMessage(
  provider: EthereumProvider,
  address: string,
  payload: ApprovalPayload,
  nonce: number,
  chainId: number,
  messageToSign: string
): Promise<string> {
  const verifiedMessage = verifyApproveIntegratorMessage(payload, nonce, chainId, messageToSign);
  return personalSign(provider, address, verifiedMessage);
}
