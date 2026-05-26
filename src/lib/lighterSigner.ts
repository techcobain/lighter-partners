import type { LighterNetwork } from "./config";
import type { ApprovalPayload } from "./validation";

type WasmVoidResult = {
  error?: string;
};

export type LighterSignedTx = {
  txType: number;
  txInfo: string;
  txHash: string;
  messageToSign: string;
};

type WasmSignedTxResult = Partial<LighterSignedTx> & {
  error?: string;
};

declare global {
  interface Window {
    Go?: new () => {
      importObject: WebAssembly.Imports;
      run(instance: WebAssembly.Instance): Promise<void>;
    };
    LighterCreateClient?: (
      url: string,
      privateKey: string,
      chainId: number,
      apiKeyIndex: number,
      accountIndex: number
    ) => WasmVoidResult;
    LighterGetPublicKey?: (apiKeyIndex: number, accountIndex: number) => { publicKey?: string; error?: string };
    LighterClearClient?: () => WasmVoidResult;
    LighterSignApproveIntegrator?: (
      integratorIndex: number,
      maxPerpsTakerFee: number,
      maxPerpsMakerFee: number,
      maxSpotTakerFee: number,
      maxSpotMakerFee: number,
      approvalExpiry: number,
      skipNonce: number,
      nonce: number,
      apiKeyIndex: number,
      accountIndex: number
    ) => WasmSignedTxResult;
  }
}

let loadPromise: Promise<void> | null = null;

export function loadLighterSigner(): Promise<void> {
  loadPromise ??= loadWasm();
  return loadPromise;
}

export async function prepareLighterClient(network: LighterNetwork, payload: ApprovalPayload): Promise<void> {
  await loadLighterSigner();
  assertWasmReady();

  const createResult = window.LighterCreateClient!(
    network.apiUrl,
    payload.apiPrivateKey,
    network.chainId,
    payload.apiKeyIndex,
    payload.accountIndex
  );
  assertNoWasmError(createResult, "Could not initialize Lighter signer.");
}

export async function clearLighterClient(): Promise<void> {
  if (!window.LighterClearClient) {
    return;
  }

  const result = window.LighterClearClient();
  assertNoWasmError(result, "Could not clear Lighter signer.");
}

export async function getLighterPublicKey(payload: ApprovalPayload): Promise<string> {
  await loadLighterSigner();
  assertWasmReady();

  const result = window.LighterGetPublicKey!(payload.apiKeyIndex, payload.accountIndex);
  assertNoWasmError(result, "Could not derive Lighter API public key.");
  if (!result.publicKey) {
    throw new Error("Lighter signer did not return an API public key.");
  }
  return result.publicKey;
}

export async function signApprovalWithLighter(payload: ApprovalPayload, nonce: number): Promise<LighterSignedTx> {
  await loadLighterSigner();
  assertWasmReady();

  const result = window.LighterSignApproveIntegrator!(
    payload.integratorAccountIndex,
    payload.maxPerpsTakerFee,
    payload.maxPerpsMakerFee,
    payload.maxSpotTakerFee,
    payload.maxSpotMakerFee,
    payload.approvalExpiry,
    0,
    nonce,
    payload.apiKeyIndex,
    payload.accountIndex
  );
  assertNoWasmError(result, "Could not sign Lighter approval transaction.");

  if (
    typeof result.txType !== "number" ||
    typeof result.txInfo !== "string" ||
    typeof result.txHash !== "string" ||
    typeof result.messageToSign !== "string" ||
    result.messageToSign.length === 0
  ) {
    throw new Error("Lighter signer returned an incomplete approval transaction.");
  }

  return {
    txType: result.txType,
    txInfo: result.txInfo,
    txHash: result.txHash,
    messageToSign: result.messageToSign
  };
}

async function loadWasm(): Promise<void> {
  if (!window.Go) {
    await loadScript("/wasm_exec.js");
  }
  if (!window.Go) {
    throw new Error("Go WASM runtime did not load.");
  }

  const go = new window.Go();
  const wasmResponse = await fetch("/lighter.wasm");
  if (!wasmResponse.ok) {
    throw new Error("Could not load Lighter WASM signer. Run npm run build:wasm.");
  }

  const bytes = await wasmResponse.arrayBuffer();
  const { instance } = await WebAssembly.instantiate(bytes, go.importObject);
  void go.run(instance);

  await new Promise((resolve) => window.setTimeout(resolve, 0));
  assertWasmReady();
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Could not load ${src}.`));
    document.head.append(script);
  });
}

function assertWasmReady(): void {
  if (!window.LighterCreateClient || !window.LighterGetPublicKey || !window.LighterClearClient || !window.LighterSignApproveIntegrator) {
    throw new Error("Lighter WASM signer is not ready.");
  }
}

function assertNoWasmError(result: WasmVoidResult | WasmSignedTxResult, fallback: string): void {
  if (result?.error) {
    throw new Error(`${fallback} ${result.error}`);
  }
}
