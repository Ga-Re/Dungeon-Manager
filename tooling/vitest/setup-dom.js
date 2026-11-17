// Component tests (jsdom): unmount rendered trees between tests.
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});
