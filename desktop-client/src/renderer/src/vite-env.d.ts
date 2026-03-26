/// <reference types="vite/client" />

import type { RendererApi } from "@shared/contracts"

declare global {
  interface Window {
    bridgeDesktop: RendererApi
  }
}

export {}
