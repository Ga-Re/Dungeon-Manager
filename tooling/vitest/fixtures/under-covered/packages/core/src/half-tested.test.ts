import { expect, test } from "vitest";
import { classify } from "./half-tested";

test("only the positive branch is exercised", () => {
  expect(classify(1)).toBe("positive");
});
