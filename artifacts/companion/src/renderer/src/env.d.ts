/// <reference types="vite/client" />

import type { CompanionAPI } from "../../preload/index";

declare global {
  interface Window {
    companion: CompanionAPI;
  }
}
