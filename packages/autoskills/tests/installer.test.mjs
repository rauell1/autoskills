import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getNpxCommand } from "../installer.mjs";

describe("installer", () => {
  it("uses npx.cmd on Windows", () => {
    assert.equal(getNpxCommand("win32"), "npx.cmd");
  });

  it("uses npx on non-Windows platforms", () => {
    assert.equal(getNpxCommand("linux"), "npx");
    assert.equal(getNpxCommand("darwin"), "npx");
  });
});
