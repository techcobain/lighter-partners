# Lighter Partner Approval

A small Vite React app for approving or revoking a Lighter partner account index from a selected Lighter account.

The flow is browser-only:

1. Connect MetaMask, Rabby, or another injected EIP-1193 wallet.
2. Load Lighter accounts for the connected L1 address.
3. Enter the Lighter API key index and API private key for the selected account.
4. Generate the Lighter approval transaction in WASM.
5. Sign the L1 approval message with the wallet.
6. Submit the signed transaction to Lighter.

The API private key is read from the local password field when signing, passed only to the browser-local WASM signer, and is not persisted.

## Lighter API Endpoints

The app talks directly to the selected Lighter API host:

- Mainnet: `https://mainnet.zklighter.elliot.ai`
- Testnet: `https://testnet.zklighter.elliot.ai`

The frontend uses these endpoints:

- `GET /api/v1/accountsByL1Address?l1_address=<wallet>`: loads Lighter accounts for the connected wallet or lookup address.
- `GET /api/v1/account?by=index&value=<account_index>&active_only=true`: loads active approved integrators for an account.
- `GET /api/v1/apikeys?account_index=<account_index>&api_key_index=<api_key_index>`: fetches the registered API public key and checks it against the local private key.
- `GET /api/v1/nextNonce?account_index=<account_index>&api_key_index=<api_key_index>`: fetches the next nonce used in the approval/revocation message.
- `POST /api/v1/sendTx`: submits the signed approval/revocation transaction as `application/x-www-form-urlencoded` with `tx_type`, `tx_info`, and `price_protection=true`.

## Commands

```bash
npm install
npm run dev
npm test
npm run build
```

`npm run dev` and `npm run build` both compile the minimal Go WASM signer into `public/lighter.wasm`.

## Configuration

Optional defaults can be set through Vite env vars:

```bash
VITE_LIGHTER_DEFAULT_INTEGRATOR_ACCOUNT_INDEX=6
VITE_LIGHTER_DEFAULT_PERPS_TAKER_FEE=1000
VITE_LIGHTER_DEFAULT_PERPS_MAKER_FEE=1000
VITE_LIGHTER_DEFAULT_SPOT_TAKER_FEE=1000
VITE_LIGHTER_DEFAULT_SPOT_MAKER_FEE=1000
```
