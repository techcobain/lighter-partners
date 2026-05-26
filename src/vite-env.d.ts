/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LIGHTER_DEFAULT_INTEGRATOR_ACCOUNT_INDEX?: string;
  readonly VITE_LIGHTER_DEFAULT_PERPS_TAKER_FEE?: string;
  readonly VITE_LIGHTER_DEFAULT_PERPS_MAKER_FEE?: string;
  readonly VITE_LIGHTER_DEFAULT_SPOT_TAKER_FEE?: string;
  readonly VITE_LIGHTER_DEFAULT_SPOT_MAKER_FEE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
