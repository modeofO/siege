import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    env: {
      // manifest_dev.json predates world_system, so the devnet address
      // resolves to "" without this; tests need a deterministic value.
      NEXT_PUBLIC_WORLD_SYSTEM_ADDRESS: "0x7757e57e3ad277057757e57e3ad27705",
      // manifest_dev.json also predates conquest — same deterministic-value need.
      NEXT_PUBLIC_CONQUEST_ADDRESS: "0xc0c0c0e57e3ad277057757e57e3ad277",
    },
  },
});
