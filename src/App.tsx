import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  KeyRound,
  ListChecks,
  Loader2,
  Moon,
  Pencil,
  PlugZap,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldOff,
  Sun,
  Wallet
} from "lucide-react";
import { DEFAULT_APPROVAL_FORM, LIGHTER_NETWORKS, toDateTimeLocal, type LighterNetworkKey } from "./lib/config";
import { buildApproveIntegratorMessage } from "./lib/approvalMessage";
import { signVerifiedApprovalMessage } from "./lib/approvalSigning";
import {
  type ApprovedIntegrator,
  approvalPayloadSummary,
  fetchApprovedIntegrators,
  fetchAccountsByL1Address,
  fetchApiKeyPublicKey,
  fetchNextNonce,
  normalizePublicKey,
  sendApprovalTx,
  withL1Signature,
  type LighterAccount
} from "./lib/lighterApi";
import { clearLighterClient, getLighterPublicKey, prepareLighterClient, signApprovalWithLighter } from "./lib/lighterSigner";
import {
  type ApprovalAction,
  type ApprovalFormState,
  approvalRequiresWalletSignature,
  isEthereumAddress,
  looksLikeLighterApiPrivateKey,
  validateApprovalForm
} from "./lib/validation";
import { connectWallet, discoverWallets, shortAddress, type EthereumProvider, type WalletOption } from "./lib/wallet";

type StepState =
  | "idle"
  | "loading-wallets"
  | "connecting"
  | "loading-accounts"
  | "checking-key"
  | "fetching-nonce"
  | "signing-lighter"
  | "reviewing-signature"
  | "signing-wallet"
  | "submitting";

type LastTx = {
  action: ApprovalAction;
  txHash: string;
  response: Record<string, unknown>;
};

const STEP_LABELS: Record<StepState, string> = {
  idle: "Ready",
  "loading-wallets": "Detecting wallets",
  connecting: "Connecting wallet",
  "loading-accounts": "Loading Lighter accounts",
  "checking-key": "Checking API key",
  "fetching-nonce": "Fetching nonce",
  "signing-lighter": "Signing Lighter transaction",
  "reviewing-signature": "Reviewing wallet message",
  "signing-wallet": "Waiting for wallet signature",
  submitting: "Submitting to Lighter"
};

type SigningReview = {
  action: ApprovalAction;
  apiHost: string;
  chainId: number;
  walletAddress: string;
  accountIndex: number;
  apiKeyIndex: number;
  integratorAccountIndex: number;
  maxPerpsTakerFee: number;
  maxPerpsMakerFee: number;
  maxSpotTakerFee: number;
  maxSpotMakerFee: number;
  approvalExpiry: number;
  nonce: number;
  messageToSign: string;
};

function App() {
  const apiKeyInputRef = useRef<HTMLInputElement>(null);
  const signingReviewResolverRef = useRef<((approved: boolean) => void) | null>(null);
  const [networkKey, setNetworkKey] = useState<LighterNetworkKey>("mainnet");
  const [form, setForm] = useState<ApprovalFormState>(DEFAULT_APPROVAL_FORM);
  const [wallets, setWallets] = useState<WalletOption[]>([]);
  const [provider, setProvider] = useState<EthereumProvider | null>(null);
  const [walletAddress, setWalletAddress] = useState("");
  const [accounts, setAccounts] = useState<LighterAccount[]>([]);
  const [selectedWalletId, setSelectedWalletId] = useState("");
  const [step, setStep] = useState<StepState>("loading-wallets");
  const [error, setError] = useState("");
  const [lastTx, setLastTx] = useState<LastTx | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [approvedIntegrators, setApprovedIntegrators] = useState<ApprovedIntegrator[]>([]);
  const [integratorsLoading, setIntegratorsLoading] = useState(false);
  const [integratorsError, setIntegratorsError] = useState("");
  const [lookupMode, setLookupMode] = useState(false);
  const [lookupAddress, setLookupAddress] = useState("");
  const [lookupAccounts, setLookupAccounts] = useState<LighterAccount[]>([]);
  const [lookupAccountIndex, setLookupAccountIndex] = useState("");
  const [lookupIntegrators, setLookupIntegrators] = useState<ApprovedIntegrator[]>([]);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [apiPrivateKeyPresent, setApiPrivateKeyPresent] = useState(false);
  const [apiPrivateKeyLooksValid, setApiPrivateKeyLooksValid] = useState(false);
  const [apiPrivateKeyRevision, setApiPrivateKeyRevision] = useState(0);
  const [signingReview, setSigningReview] = useState<SigningReview | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("theme") as "light" | "dark") || "light";
    }
    return "light";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  const network = LIGHTER_NETWORKS[networkKey];
  const selectedWallet = wallets.find((wallet) => wallet.id === selectedWalletId) ?? wallets[0];
  const reviewValidationKey = apiPrivateKeyLooksValid ? `0x${"00".repeat(40)}` : "";
  const validation = useMemo(
    () => validateApprovalForm(form, "approve", reviewValidationKey),
    [apiPrivateKeyRevision, form, reviewValidationKey]
  );
  const reviewPayload = validation.ok ? approvalPayloadSummary(validation.payload) : null;

  useEffect(() => {
    void refreshWallets();
  }, []);

  useEffect(() => {
    if (!form.accountIndex) {
      setApprovedIntegrators([]);
      return;
    }
    void loadApprovedIntegrators(form.accountIndex);
  }, [form.accountIndex, network.apiUrl]);

  useEffect(() => {
    if (!provider?.on) {
      return;
    }
    const handleAccountsChanged = (...args: unknown[]) => {
      const nextAccounts = args[0] as string[] | undefined;
      const nextAddress = nextAccounts?.[0] ?? "";
      resolveSigningReview(false);
      void clearApiPrivateKey();
      setWalletAddress(nextAddress);
      setAccounts([]);
      setApprovedIntegrators([]);
      setIntegratorsError("");
      setLastTx(null);
      setForm((current) => ({ ...current, accountIndex: "" }));
      if (nextAddress && !lookupMode) {
        void loadAccounts(nextAddress);
      }
    };
    const handleChainChanged = () => {
      resolveSigningReview(false);
      void clearApiPrivateKey();
      setLastTx(null);
      setApprovedIntegrators([]);
      setError("Wallet network changed. Review the selected Lighter network before signing.");
    };
    provider.on("accountsChanged", handleAccountsChanged);
    provider.on("chainChanged", handleChainChanged);
    return () => {
      provider.removeListener?.("accountsChanged", handleAccountsChanged);
      provider.removeListener?.("chainChanged", handleChainChanged);
    };
  }, [lookupMode, provider, network.apiUrl]);

  async function refreshWallets() {
    setStep("loading-wallets");
    setError("");
    try {
      const found = await discoverWallets();
      setWallets(found);
      setSelectedWalletId((current) => current || found[0]?.id || "");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setStep("idle");
    }
  }

  async function handleConnect() {
    if (!selectedWallet) {
      setError("No injected wallet found. Install MetaMask or Rabby, then refresh wallets.");
      return;
    }

    setStep("connecting");
    setError("");
    setLastTx(null);
    void clearApiPrivateKey();
    try {
      const address = await connectWallet(selectedWallet.provider);
      setProvider(selectedWallet.provider);
      setWalletAddress(address);
      await loadAccounts(address);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setStep("idle");
    }
  }

  async function loadAccounts(address = walletAddress, apiUrl = network.apiUrl) {
    if (!address) {
      return;
    }
    setStep("loading-accounts");
    setError("");
    try {
      const foundAccounts = await fetchAccountsByL1Address(apiUrl, address);
      setAccounts(foundAccounts);
      const firstIndex = foundAccounts[0]?.index;
      setForm((current) => ({
        ...current,
        accountIndex: current.accountIndex || (firstIndex !== undefined ? String(firstIndex) : "")
      }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setStep("idle");
    }
  }

  async function loadApprovedIntegrators(accountIndexValue = form.accountIndex, apiUrl = network.apiUrl) {
    const accountIndex = Number(accountIndexValue);
    if (!Number.isSafeInteger(accountIndex) || accountIndex < 0) {
      setApprovedIntegrators([]);
      return;
    }

    setIntegratorsLoading(true);
    setIntegratorsError("");
    try {
      const integrators = await fetchApprovedIntegrators(apiUrl, accountIndex);
      setApprovedIntegrators(integrators);
    } catch (err) {
      setApprovedIntegrators([]);
      setIntegratorsError(errorMessage(err));
    } finally {
      setIntegratorsLoading(false);
    }
  }

  async function lookupAddressAccounts() {
    const address = lookupAddress.trim();
    if (!address) return;
    if (!isEthereumAddress(address)) {
      setLookupError("Enter a valid Ethereum address.");
      setLookupAccounts([]);
      setLookupAccountIndex("");
      setLookupIntegrators([]);
      return;
    }

    setLookupLoading(true);
    setLookupError("");
    setLookupAccounts([]);
    setLookupAccountIndex("");
    setLookupIntegrators([]);
    try {
      const found = await fetchAccountsByL1Address(network.apiUrl, address);
      setLookupAccounts(found);
      if (found.length > 0) {
        const firstIdx = String(found[0].index);
        setLookupAccountIndex(firstIdx);
        await lookupLoadIntegrators(firstIdx);
      }
    } catch (err) {
      setLookupError(errorMessage(err));
    } finally {
      setLookupLoading(false);
    }
  }

  async function lookupLoadIntegrators(accountIndexValue: string, apiUrl = network.apiUrl) {
    const idx = Number(accountIndexValue);
    if (!Number.isSafeInteger(idx) || idx < 0) return;
    setLookupLoading(true);
    setLookupError("");
    try {
      const integrators = await fetchApprovedIntegrators(apiUrl, idx);
      setLookupIntegrators(integrators);
    } catch (err) {
      setLookupIntegrators([]);
      setLookupError(errorMessage(err));
    } finally {
      setLookupLoading(false);
    }
  }

  function handleLookupModeToggle() {
    const next = !lookupMode;
    setLookupMode(next);
    setLastTx(null);
    setError("");
    if (!next) {
      resetLookupState();
      if (walletAddress && accounts.length === 0) {
        void loadAccounts(walletAddress);
      }
      return;
    }

    resolveSigningReview(false);
    void clearApiPrivateKey();
    setAccounts([]);
    setApprovedIntegrators([]);
    setForm((current) => ({ ...current, accountIndex: "" }));
  }

  function resetLookupState() {
    setLookupAddress("");
    setLookupAccounts([]);
    setLookupAccountIndex("");
    setLookupIntegrators([]);
    setLookupError("");
  }

  function clearApiPrivateKey() {
    if (apiKeyInputRef.current) {
      apiKeyInputRef.current.value = "";
    }
    setApiPrivateKeyPresent(false);
    setApiPrivateKeyLooksValid(false);
    setApiPrivateKeyRevision((current) => current + 1);
    setShowApiKey(false);
    void clearLighterClient();
  }

  function handleApiPrivateKeyInput(value: string) {
    setApiPrivateKeyPresent(value.trim().length > 0);
    setApiPrivateKeyLooksValid(looksLikeLighterApiPrivateKey(value));
    setApiPrivateKeyRevision((current) => current + 1);
  }

  function handleAccountIndexChange(value: string) {
    void clearApiPrivateKey();
    setLastTx(null);
    setApprovedIntegrators([]);
    setIntegratorsError("");
    updateForm("accountIndex", value);
  }

  function handleApiKeyIndexChange(value: string) {
    const previousApiKeyIndex = form.apiKeyIndex.trim();
    if (previousApiKeyIndex && previousApiKeyIndex !== value.trim()) {
      void clearApiPrivateKey();
    }
    setLastTx(null);
    updateForm("apiKeyIndex", value);
  }

  function handleWalletSelectionChange(walletId: string) {
    resolveSigningReview(false);
    void clearApiPrivateKey();
    setSelectedWalletId(walletId);
    setProvider(null);
    setWalletAddress("");
    setAccounts([]);
    setApprovedIntegrators([]);
    setError("");
    setLastTx(null);
    setForm((current) => ({ ...current, accountIndex: "" }));
  }

  function handleNetworkChange(nextNetworkKey: LighterNetworkKey) {
    if (nextNetworkKey === networkKey) {
      return;
    }

    const nextNetwork = LIGHTER_NETWORKS[nextNetworkKey];
    resolveSigningReview(false);
    void clearApiPrivateKey();
    setNetworkKey(nextNetworkKey);
    setAccounts([]);
    setApprovedIntegrators([]);
    setIntegratorsError("");
    setError("");
    setLastTx(null);
    setForm((current) => ({ ...current, accountIndex: "" }));
    resetLookupState();

    if (walletAddress && !lookupMode) {
      void loadAccounts(walletAddress, nextNetwork.apiUrl);
    }
  }

  function requestSigningReview(review: SigningReview): Promise<void> {
    setSigningReview(review);
    return new Promise((resolve, reject) => {
      signingReviewResolverRef.current = (approved) => {
        signingReviewResolverRef.current = null;
        setSigningReview(null);
        if (approved) {
          resolve();
        } else {
          reject(new Error("Wallet signature review was cancelled."));
        }
      };
    });
  }

  function resolveSigningReview(approved: boolean) {
    signingReviewResolverRef.current?.(approved);
  }

  async function submitApproval(action: ApprovalAction, sourceForm = form) {
    if (!provider || !walletAddress) {
      setError("Connect a wallet before signing.");
      return;
    }

    const apiPrivateKey = apiKeyInputRef.current?.value ?? "";
    const result = validateApprovalForm(sourceForm, action, apiPrivateKey);
    if (!result.ok) {
      setError(result.errors.join(" "));
      return;
    }

    setError("");
    setLastTx(null);
    try {
      setStep("checking-key");
      await prepareLighterClient(network, result.payload);
      const [localPublicKey, remotePublicKey] = await Promise.all([
        getLighterPublicKey(result.payload),
        fetchApiKeyPublicKey(network.apiUrl, result.payload.accountIndex, result.payload.apiKeyIndex)
      ]);
      if (normalizePublicKey(localPublicKey) !== normalizePublicKey(remotePublicKey)) {
        throw new Error("Lighter API key does not match the selected account and API key index.");
      }

      setStep("fetching-nonce");
      const nonce = await fetchNextNonce(network.apiUrl, result.payload.accountIndex, result.payload.apiKeyIndex);

      setStep("signing-lighter");
      const lighterTx = await signApprovalWithLighter(result.payload, nonce);
      let signedTxInfo = lighterTx.txInfo;
      if (approvalRequiresWalletSignature(action, result.payload)) {
        const verifiedMessage = buildApproveIntegratorMessage(result.payload, nonce, network.chainId);
        if (lighterTx.messageToSign !== verifiedMessage) {
          throw new Error("Lighter signer returned an unexpected L1 approval message. Wallet signing was blocked.");
        }

        setStep("reviewing-signature");
        await requestSigningReview({
          action,
          apiHost: network.apiUrl,
          chainId: network.chainId,
          walletAddress,
          accountIndex: result.payload.accountIndex,
          apiKeyIndex: result.payload.apiKeyIndex,
          integratorAccountIndex: result.payload.integratorAccountIndex,
          maxPerpsTakerFee: result.payload.maxPerpsTakerFee,
          maxPerpsMakerFee: result.payload.maxPerpsMakerFee,
          maxSpotTakerFee: result.payload.maxSpotTakerFee,
          maxSpotMakerFee: result.payload.maxSpotMakerFee,
          approvalExpiry: result.payload.approvalExpiry,
          nonce,
          messageToSign: verifiedMessage
        });

        setStep("signing-wallet");
        const l1Signature = await signVerifiedApprovalMessage(
          provider,
          walletAddress,
          result.payload,
          nonce,
          network.chainId,
          lighterTx.messageToSign
        );
        signedTxInfo = withL1Signature(lighterTx.txInfo, l1Signature);
      }

      setStep("submitting");
      const response = await sendApprovalTx(network.apiUrl, lighterTx.txType, signedTxInfo);
      setLastTx({
        action,
        txHash: lighterTx.txHash,
        response
      });
      await loadApprovedIntegrators(String(result.payload.accountIndex));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      void clearLighterClient();
      setStep("idle");
    }
  }

  function updateForm<K extends keyof ApprovalFormState>(key: K, value: ApprovalFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function manageIntegrator(integrator: ApprovedIntegrator) {
    setForm((current) => ({
      ...current,
      integratorAccountIndex: String(integrator.account_index),
      maxPerpsTakerFee: String(integrator.max_perps_taker_fee),
      maxPerpsMakerFee: String(integrator.max_perps_maker_fee),
      maxSpotTakerFee: String(integrator.max_spot_taker_fee),
      maxSpotMakerFee: String(integrator.max_spot_maker_fee),
      approvalExpiry: toDateTimeLocal(new Date(normalizeExpiryMs(integrator.approval_expiry)))
    }));
  }

  async function revokeIntegrator(integrator: ApprovedIntegrator) {
    const label = integrator.name || `account ${integrator.account_index}`;
    const ok = window.confirm(`Revoke approval for ${label}? Your wallet will ask you to sign this revocation.`);
    if (!ok) {
      return;
    }

    await submitApproval("revoke", {
      ...form,
      integratorAccountIndex: String(integrator.account_index)
    });
  }

  const isBusy = step !== "idle";
  const canSignForAccount = Boolean(provider && walletAddress && form.accountIndex && apiPrivateKeyPresent && apiPrivateKeyLooksValid);
  const canSubmit = Boolean(canSignForAccount && form.integratorAccountIndex);

  return (
    <>
      <div className="bg-gradients" />
      <main className="app-shell">
      <section className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark">
            <img src={theme === "dark" ? "/logo-dark.png" : "/logo-light.png"} alt="Lighter" />
          </div>
          <div>
            <p className="eyebrow">Lighter partner integration</p>
            <h1>Approve & Manage partners</h1>
          </div>
        </div>

        <div className="status-strip">
          <select
            className={`network-pill ${networkKey}`}
            value={networkKey}
            onChange={(event) => handleNetworkChange(event.target.value as LighterNetworkKey)}
            disabled={isBusy}
          >
            <option value="mainnet">Mainnet</option>
            <option value="testnet">Testnet</option>
          </select>
          <span className="status-pill">
            {isBusy ? <Loader2 className="spin" size={16} /> : <CheckCircle2 size={16} />}
            {STEP_LABELS[step]}
          </span>
          <button
            className="theme-toggle"
            type="button"
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
          >
            {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
          </button>
        </div>
      </section>

      <section className="workspace-grid">
        <div className="approval-panel">
          <div className="section-band flush-top">
            <div className="section-title split">
              <div>
                <Wallet size={18} />
                <h3>Wallet</h3>
              </div>
              <label className="lookup-toggle">
                <input type="checkbox" checked={lookupMode} onChange={handleLookupModeToggle} />
                <Eye size={14} />
                <span>Lookup address</span>
              </label>
            </div>

            {lookupMode ? (
              <div className="lookup-section">
                <div className="wallet-row">
                  <label className="field flex-field">
                    <span>Wallet address</span>
                    <input
                      type="text"
                      value={lookupAddress}
                      onChange={(e) => setLookupAddress(e.target.value)}
                      placeholder="0x..."
                      onKeyDown={(e) => { if (e.key === "Enter") void lookupAddressAccounts(); }}
                    />
                  </label>
                  <button
                    className="command-button primary lookup-submit"
                    type="button"
                    onClick={() => void lookupAddressAccounts()}
                    disabled={lookupLoading || !lookupAddress.trim()}
                  >
                    {lookupLoading ? <Loader2 className="spin" size={16} /> : <Search size={16} />}
                    Lookup
                  </button>
                </div>

                {lookupAccounts.length > 0 ? (
                  <label className="field with-top-gap">
                    <span>Account index</span>
                    <select
                      value={lookupAccountIndex}
                      onChange={(e) => {
                        setLookupAccountIndex(e.target.value);
                        void lookupLoadIntegrators(e.target.value);
                      }}
                    >
                      {lookupAccounts.map((a) => (
                        <option key={a.index} value={a.index}>
                          {a.index}{a.available_balance ? ` - ${a.available_balance} USDC available` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                {lookupError ? (
                  <div className="notice error compact-notice with-top-gap">
                    <AlertTriangle size={17} />
                    <span>{lookupError}</span>
                  </div>
                ) : null}

                {lookupAccounts.length > 0 ? (
                  <div className="section-band integrators-section nested-integrators">
                    <div className="section-title split">
                      <div>
                        <ListChecks size={18} />
                        <h3>Approved integrators</h3>
                      </div>
                      <button
                        className="icon-button secondary"
                        type="button"
                        onClick={() => void lookupLoadIntegrators(lookupAccountIndex)}
                        disabled={lookupLoading || !lookupAccountIndex}
                        title="Refresh"
                      >
                        {lookupLoading ? <Loader2 className="spin" size={17} /> : <RefreshCw size={17} />}
                      </button>
                    </div>

                    {lookupLoading ? <p className="empty-state">Loading...</p> : null}
                    {!lookupLoading && lookupIntegrators.length === 0 && !lookupError ? (
                      <p className="empty-state">No approved integrators found for this account.</p>
                    ) : null}

                    {lookupIntegrators.length > 0 ? (
                      <div className="integrator-list">
                        {lookupIntegrators.map((integrator) => (
                          <div className="integrator-row" key={`lookup-${integrator.account_index}-${integrator.approval_expiry}`}>
                            <div className="integrator-main">
                              <strong>{integrator.name || `Integrator ${integrator.account_index}`}</strong>
                              <span>Account {integrator.account_index}</span>
                            </div>
                            <div className="integrator-fees">
                              <span>Perps T/M {formatFeeBps(integrator.max_perps_taker_fee, false)} / {formatFeeBps(integrator.max_perps_maker_fee, false)}</span>
                              <span>Spot T/M {formatFeeBps(integrator.max_spot_taker_fee, false)} / {formatFeeBps(integrator.max_spot_maker_fee, false)}</span>
                              <span>Expires {formatExpiry(integrator.approval_expiry)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="wallet-row">
                <label className="field wallet-select">
                  <span>Provider</span>
                  <select
                    value={selectedWallet?.id ?? ""}
                    onChange={(event) => handleWalletSelectionChange(event.target.value)}
                    disabled={isBusy || wallets.length === 0}
                  >
                    {wallets.length === 0 ? <option>No wallet detected</option> : null}
                    {wallets.map((wallet) => (
                      <option key={wallet.id} value={wallet.id}>
                        {wallet.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="icon-button secondary" type="button" onClick={refreshWallets} disabled={isBusy} title="Refresh wallets">
                  <RefreshCw size={17} />
                </button>
                <button className="command-button" type="button" onClick={handleConnect} disabled={isBusy || wallets.length === 0}>
                  <PlugZap size={17} />
                  {walletAddress ? shortAddress(walletAddress) : "Connect"}
                </button>
              </div>
            )}
          </div>

          {!lookupMode ? (
          <>
          <div className="section-band">
            <div className="section-title">
              <KeyRound size={18} />
              <h3>Lighter account</h3>
            </div>
            <div className="form-grid two">
              <label className="field">
                <span>Account index</span>
                <select
                  value={form.accountIndex}
                  onChange={(event) => handleAccountIndexChange(event.target.value)}
                  disabled={isBusy || accounts.length === 0}
                >
                  {accounts.length === 0 ? <option value="">Connect wallet to load accounts</option> : null}
                  {accounts.map((account) => (
                    <option key={account.index} value={account.index}>
                      {account.index}
                      {account.available_balance ? ` - ${account.available_balance} USDC available` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>API key index</span>
                <input
                  inputMode="numeric"
                  value={form.apiKeyIndex}
                  onChange={(event) => handleApiKeyIndexChange(event.target.value)}
                  disabled={isBusy}
                />
              </label>
            </div>
            <label className="field">
              <span>API private key</span>
              <div className="password-field">
                <input
                  ref={apiKeyInputRef}
                  type={showApiKey ? "text" : "password"}
                  onInput={(event) => handleApiPrivateKeyInput(event.currentTarget.value)}
                  autoComplete="off"
                  spellCheck={false}
                  disabled={isBusy}
                />
                <button type="button" onClick={() => setShowApiKey((value) => !value)} disabled={isBusy}>
                  {showApiKey ? "Hide" : "Show"}
                </button>
              </div>
            </label>
          </div>

          <div className="section-band">
            <div className="section-title">
              <ShieldCheck size={18} />
              <h3>Approval</h3>
            </div>
            <p className="section-subtitle">Zero-fee approvals use only the L2 API-key signature. Fee approvals and revokes also require a wallet signature.</p>
            <div className="form-grid two">
              <label className="field">
                <span>Integrator account index</span>
                <input
                  inputMode="numeric"
                  value={form.integratorAccountIndex}
                  onChange={(event) => updateForm("integratorAccountIndex", event.target.value)}
                  disabled={isBusy}
                />
              </label>
              <label className="field">
                <span>Approval expiry</span>
                <input
                  type="datetime-local"
                  value={form.approvalExpiry}
                  onChange={(event) => updateForm("approvalExpiry", event.target.value)}
                  disabled={isBusy}
                />
              </label>
              <label className="field">
                <span>Max perps taker fee</span>
                <input
                  inputMode="numeric"
                  value={form.maxPerpsTakerFee}
                  onChange={(event) => updateForm("maxPerpsTakerFee", event.target.value)}
                  disabled={isBusy}
                />
                <span className="fee-hint">{formatFeeBps(form.maxPerpsTakerFee)}</span>
              </label>
              <label className="field">
                <span>Max perps maker fee</span>
                <input
                  inputMode="numeric"
                  value={form.maxPerpsMakerFee}
                  onChange={(event) => updateForm("maxPerpsMakerFee", event.target.value)}
                  disabled={isBusy}
                />
                <span className="fee-hint">{formatFeeBps(form.maxPerpsMakerFee)}</span>
              </label>
              <label className="field">
                <span>Max spot taker fee</span>
                <input
                  inputMode="numeric"
                  value={form.maxSpotTakerFee}
                  onChange={(event) => updateForm("maxSpotTakerFee", event.target.value)}
                  disabled={isBusy}
                />
                <span className="fee-hint">{formatFeeBps(form.maxSpotTakerFee)}</span>
              </label>
              <label className="field">
                <span>Max spot maker fee</span>
                <input
                  inputMode="numeric"
                  value={form.maxSpotMakerFee}
                  onChange={(event) => updateForm("maxSpotMakerFee", event.target.value)}
                  disabled={isBusy}
                />
                <span className="fee-hint">{formatFeeBps(form.maxSpotMakerFee)}</span>
              </label>
            </div>
          </div>

          {error ? (
            <div className="notice error">
              <AlertTriangle size={18} />
              <span>{error}</span>
            </div>
          ) : null}

          {lastTx ? (
            <div className="notice success">
              <CheckCircle2 size={18} />
              <span>
                {lastTx.action === "approve" ? "Approval" : "Revocation"} submitted. Tx hash: <code>{lastTx.txHash}</code>
              </span>
            </div>
          ) : null}

          <div className="action-row">
            <button className="command-button primary" type="button" disabled={isBusy || !canSubmit} onClick={() => submitApproval("approve")}>
              {step === "signing-lighter" || step === "reviewing-signature" || step === "signing-wallet" || step === "submitting" ? (
                <Loader2 className="spin" size={17} />
              ) : (
                <ShieldCheck size={17} />
              )}
              Approve
            </button>
            <button className="command-button danger" type="button" disabled={isBusy || !canSubmit} onClick={() => submitApproval("revoke")}>
              <ShieldOff size={17} />
              Revoke
            </button>
          </div>

          <div className="section-band integrators-section">
            <div className="section-title split">
              <div>
                <ListChecks size={18} />
                <h3>Approved integrators</h3>
              </div>
              <button
                className="icon-button secondary"
                type="button"
                onClick={() => loadApprovedIntegrators()}
                disabled={isBusy || integratorsLoading || !form.accountIndex}
                title="Refresh approved integrators"
              >
                {integratorsLoading ? <Loader2 className="spin" size={17} /> : <RefreshCw size={17} />}
              </button>
            </div>

            {integratorsError ? (
              <div className="notice error compact-notice">
                <AlertTriangle size={17} />
                <span>{integratorsError}</span>
              </div>
            ) : null}

            {!form.accountIndex ? <p className="empty-state">Select a Lighter account to load approved integrators.</p> : null}
            {form.accountIndex && integratorsLoading ? <p className="empty-state">Loading approved integrators...</p> : null}
            {form.accountIndex && !integratorsLoading && approvedIntegrators.length === 0 && !integratorsError ? (
              <p className="empty-state">No approved integrators found for this account.</p>
            ) : null}

            {approvedIntegrators.length > 0 ? (
              <div className="integrator-list">
                {approvedIntegrators.map((integrator) => (
                  <div className="integrator-row" key={`${integrator.account_index}-${integrator.approval_expiry}`}>
                    <div className="integrator-main">
                      <strong>{integrator.name || `Integrator ${integrator.account_index}`}</strong>
                      <span>Account {integrator.account_index}</span>
                    </div>
                    <div className="integrator-fees">
                      <span>Perps T/M {formatFeeBps(integrator.max_perps_taker_fee, false)} / {formatFeeBps(integrator.max_perps_maker_fee, false)}</span>
                      <span>Spot T/M {formatFeeBps(integrator.max_spot_taker_fee, false)} / {formatFeeBps(integrator.max_spot_maker_fee, false)}</span>
                      <span>Expires {formatExpiry(integrator.approval_expiry)}</span>
                    </div>
                    <div className="integrator-actions">
                      <button className="command-button secondary" type="button" onClick={() => manageIntegrator(integrator)} disabled={isBusy}>
                        <Pencil size={16} />
                        Manage
                      </button>
                      <button
                        className="command-button danger"
                        type="button"
                        onClick={() => revokeIntegrator(integrator)}
                        disabled={isBusy || !canSignForAccount}
                      >
                        <ShieldOff size={16} />
                        Revoke
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          </>
          ) : null}
        </div>

        <aside className="review-panel">
          <h2>Review</h2>
          <dl>
            <div>
              <dt>Wallet</dt>
              <dd>{walletAddress ? shortAddress(walletAddress) : "Not connected"}</dd>
            </div>
            <div>
              <dt>API host</dt>
              <dd>{network.apiUrl}</dd>
            </div>
            <div>
              <dt>Account</dt>
              <dd>{form.accountIndex || "Select account"}</dd>
            </div>
            <div>
              <dt>Partner</dt>
              <dd>{form.integratorAccountIndex || "Set partner index"}</dd>
            </div>
          </dl>

          <div className="summary-box">
            <h3>Approval payload</h3>
            <pre>{JSON.stringify(reviewPayload ?? validation, null, 2)}</pre>
          </div>

          <div className="security-note">
            <KeyRound size={17} />
            <p>
              The API private key never leaves your local browser. It is read from this password field only for local WASM signing and is not
              sent to Lighter or your wallet. As a best practice, refresh the API key after using this site{" "}
              <a href="https://app.lighter.xyz/apikeys" target="_blank" rel="noreferrer">
                here
              </a>.
            </p>
          </div>
        </aside>
      </section>
      {signingReview ? (
        <div className="review-dialog-backdrop" role="presentation">
          <section className="review-dialog" role="dialog" aria-modal="true" aria-labelledby="wallet-review-title">
            <div className="review-dialog-header">
              <div>
                <p className="eyebrow">{signingReview.action === "approve" ? "Approve" : "Revoke"} integrator</p>
                <h2 id="wallet-review-title">Wallet signature review</h2>
              </div>
              <ShieldCheck size={19} />
            </div>
            <dl className="review-dialog-grid">
              <div>
                <dt>API host</dt>
                <dd>{signingReview.apiHost}</dd>
              </div>
              <div>
                <dt>Chain ID</dt>
                <dd>{signingReview.chainId}</dd>
              </div>
              <div>
                <dt>Wallet</dt>
                <dd>{shortAddress(signingReview.walletAddress)}</dd>
              </div>
              <div>
                <dt>Account</dt>
                <dd>{signingReview.accountIndex}</dd>
              </div>
              <div>
                <dt>API key</dt>
                <dd>{signingReview.apiKeyIndex}</dd>
              </div>
              <div>
                <dt>Integrator</dt>
                <dd>{signingReview.integratorAccountIndex}</dd>
              </div>
              <div>
                <dt>Perps fees</dt>
                <dd>{formatFeeBps(signingReview.maxPerpsTakerFee, false)} / {formatFeeBps(signingReview.maxPerpsMakerFee, false)}</dd>
              </div>
              <div>
                <dt>Spot fees</dt>
                <dd>{formatFeeBps(signingReview.maxSpotTakerFee, false)} / {formatFeeBps(signingReview.maxSpotMakerFee, false)}</dd>
              </div>
              <div>
                <dt>Expiry</dt>
                <dd>{formatExpiry(signingReview.approvalExpiry)}</dd>
              </div>
              <div>
                <dt>Nonce</dt>
                <dd>{signingReview.nonce}</dd>
              </div>
            </dl>
            <div className="summary-box wallet-message-box">
              <h3>Exact wallet message</h3>
              <pre>{signingReview.messageToSign}</pre>
            </div>
            <div className="review-dialog-actions">
              <button className="command-button secondary" type="button" onClick={() => resolveSigningReview(false)}>
                Cancel
              </button>
              <button className="command-button primary" type="button" onClick={() => resolveSigningReview(true)}>
                <Wallet size={16} />
                Sign in wallet
              </button>
            </div>
          </section>
        </div>
      ) : null}
      <footer className="app-footer">
        This application is{" "}
        <a href="https://github.com/techcobain/Lighter-partners" target="_blank" rel="noopener noreferrer">
          open source
        </a>{" "}
        — verify the code before use.
      </footer>
    </main>
    </>
  );
}

function errorMessage(err: unknown): string {
  if (isWalletRejection(err)) {
    return "Wallet signature request was rejected.";
  }

  const message = extractErrorText(err);
  if (message) {
    return message;
  }

  return "Something went wrong. Check your wallet or browser console for details.";
}

function extractErrorText(value: unknown, seen = new WeakSet<object>()): string {
  if (typeof value === "string") {
    return value === "[object Object]" ? "" : value;
  }

  if (value instanceof Error) {
    const errorMessageText = extractErrorText(value.message, seen) || extractErrorText((value as Error & { cause?: unknown }).cause, seen);
    if (errorMessageText) {
      return errorMessageText;
    }
  }

  if (isRecord(value)) {
    if (seen.has(value)) {
      return "";
    }
    seen.add(value);
    for (const key of ["message", "shortMessage", "reason", "details"] as const) {
      const text = extractErrorText(value[key], seen);
      if (text) {
        return text;
      }
    }
    const nested = extractErrorText(value.error, seen) || extractErrorText(value.data, seen);
    if (nested) {
      return nested;
    }
    return stringifyRecord(value);
  }

  return value === undefined || value === null ? "" : String(value);
}

function isWalletRejection(value: unknown): boolean {
  const text = `${extractErrorText(value)} ${stringifyRecord(value)}`.toLowerCase();
  return findErrorCode(value) === 4001 || /\b(user rejected|rejected by user|denied|declined|cancelled|canceled)\b/.test(text);
}

function findErrorCode(value: unknown, seen = new WeakSet<object>()): number | null {
  if (!isRecord(value)) {
    return null;
  }
  if (seen.has(value)) {
    return null;
  }
  seen.add(value);
  if (typeof value.code === "number") {
    return value.code;
  }
  if (typeof value.code === "string" && /^\d+$/.test(value.code)) {
    return Number(value.code);
  }
  return findErrorCode(value.error, seen) ?? findErrorCode(value.data, seen);
}

function stringifyRecord(value: unknown): string {
  if (!isRecord(value)) {
    return "";
  }
  try {
    const serialized = JSON.stringify(value);
    return serialized === "{}" ? "" : serialized;
  } catch {
    return "";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function normalizeExpiryMs(value: number): number {
  return value > 0 && value < 10_000_000_000 ? value * 1000 : value;
}

function formatExpiry(value: number): string {
  if (value <= 0) {
    return "revoked";
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(normalizeExpiryMs(value)));
}

function formatFeeBps(value: string | number, includeRaw = true): string {
  const raw = typeof value === "number" ? value : /^\d+$/.test(value.trim()) ? Number(value.trim()) : null;
  if (raw === null || !Number.isFinite(raw)) {
    return "bps unavailable";
  }

  const bps = raw / 100;
  const formatted = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 4
  }).format(bps);
  return includeRaw ? `${formatted} bps` : `${formatted} bps`;
}

export default App;
