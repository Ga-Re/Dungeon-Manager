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
    const { date: _date, ...withoutDate } = session;
    expect(sessionSchema.parse(withoutDate)).toEqual(withoutDate);
  });

  it("allows a scene only once per session but in several sessions", () => {
    expect(
      sessionSchema.safeParse({ ...session, sceneIds: ["krypta", "krypta"] })
        .success,
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
