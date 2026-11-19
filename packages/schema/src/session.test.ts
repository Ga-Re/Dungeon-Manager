import { describe, expect, it } from "vitest";
import {
  SESSION_VERSION,
  migrateDocument,
  sessionDocument,
  sessionSchema,
} from "./index.js";

const session = {
  schemaVersion: SESSION_VERSION,
  id: "s-3",
  name: "Session 3 – Die Gruft",
  date: "2026-11-28",
  sceneIds: ["krypta", "grabkammer"],
};

describe("session document (T-160)", () => {
  it("accepts a session with an ordered scene list and keeps unknown fields", () => {
    const parsed = migrateDocument(
      { ...session, mood: "düster" },
      sessionDocument,
    );
    expect(parsed).toEqual({ ...session, mood: "düster" });
  });

  it("makes the date optional", () => {
    const withoutDate: Record<string, unknown> = { ...session };
    delete withoutDate["date"];
    expect(sessionSchema.parse(withoutDate)).toEqual(withoutDate);
  });

  it("allows a scene only once per session but in several sessions", () => {
    expect(
      sessionSchema.safeParse({ ...session, sceneIds: ["krypta", "krypta"] })
        .success,
    ).toBe(false);
  });

  it("accepts a real leap day only", () => {
    expect(
      sessionSchema.safeParse({ ...session, date: "2024-02-29" }).success,
    ).toBe(true);
    expect(
      sessionSchema.safeParse({ ...session, date: "2025-02-29" }).success,
    ).toBe(false);
    expect(
      sessionSchema.safeParse({ ...session, date: "2100-02-29" }).success,
    ).toBe(false);
  });

  it.each([
    ["an empty name", { name: "" }],
    ["a date that is not YYYY-MM-DD", { date: "28.11.2026" }],
    ["an impossible date", { date: "2026-02-30" }],
    ["an invalid scene id", { sceneIds: ["../x"] }],
  ])("rejects %s", (_case, change) => {
    expect(sessionSchema.safeParse({ ...session, ...change }).success).toBe(
      false,
    );
  });
});
