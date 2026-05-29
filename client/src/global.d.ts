/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Absolutní základ URL API (např. https://api.example.com). Prázdné = stejný origin / Vite proxy. */
  readonly VITE_API_URL?: string;
}

declare const __DEV__: boolean;
