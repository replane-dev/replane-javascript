import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  cleanup();
  // Clean up window.__REPLANE_SNAPSHOT__ between tests
  if (typeof window !== "undefined") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).__REPLANE_SNAPSHOT__;
  }
  vi.restoreAllMocks();
});
