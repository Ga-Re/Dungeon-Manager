// Component tests (jsdom): unmount rendered trees between tests.
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});

// jsdom has no ResizeObserver; the panel library (dockview, T-172a) observes its container.
// jsdom lays nothing out either, so no size ever changes and observers never fire.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
