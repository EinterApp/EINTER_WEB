// Ambient type declarations for Vite env vars and the global fetchAPI
// helper.
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AUTH0_DOMAIN: string;
  readonly VITE_AUTH0_CLIENT_ID: string;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_AUTH_EMULATOR_URL?: string;
  readonly VITE_MAINTENANCE_MODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare function fetchAPI(path: string, options?: RequestInit): Promise<unknown>;
