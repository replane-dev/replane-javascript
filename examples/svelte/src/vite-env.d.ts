/// <reference types="svelte" />
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_REPLANE_SDK_KEY: string;
  readonly VITE_REPLANE_BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
