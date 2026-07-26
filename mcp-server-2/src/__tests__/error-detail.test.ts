import { describe, it, expect } from "vitest";

import { isUninformative } from "../tools.js";

/**
 * Guards the `_debug` attach heuristic.
 *
 * The original rule was `message.length < 30`, intended to mean "too short to
 * be a real reason". But Cairo `felt252` short strings cap at 31 characters, so
 * every genuine revert reason in the contracts is short — all 84 are under 30
 * chars. The rule therefore fired on every clear error and appended ~1k tokens
 * of raw stringified error to the tool result.
 *
 * These cases are lifted verbatim from `assert(..., '...')` sites across
 * src/systems/*.cairo. If a future change starts flagging them again, the
 * context regression shows up here rather than in production transcripts.
 */

const REAL_REVERT_REASONS = [
  "Ability not available",
  "Ability not owned",
  "Ability token not set",
  "Already being pillaged",
  "Already committed",
  "Already in a faction",
  "Already initialized",
  "Already max tier",
  "Already registered",
  "Already revealed",
  "Already settled",
  "Approve ability operator",
  "Array length mismatch",
  "Cannot attack home parcel",
  "Cannot attack own parcel",
  "Cannot invite self",
  "Cannot trap unowned node",
  "Commit deadline not reached",
  "Entry not funded",
  "Entry token not enabled",
  "Invalid ability ID",
  "Invalid reveal",
  "Invalid trap value",
  "Match not active",
  "Match not finished",
  "Not a match participant",
  "Not all revealed",
  "Not registered",
  "Not the winner",
  "Over budget",
  "Parcel already claimed",
  "Parcel not unclaimed",
  "Pot already claimed",
  "Requires Strategos rank",
  "Reveal deadline not reached",
  "Too many abilities for tier",
];

describe("isUninformative", () => {
  it("never flags a real Cairo revert reason", () => {
    const flagged = REAL_REVERT_REASONS.filter(isUninformative);
    expect(flagged).toEqual([]);
  });

  it("is not keyed on message length", () => {
    // The shortest real reason in the repo is 11 chars.
    expect(isUninformative("Over budget")).toBe(false);
    expect("Over budget".length).toBeLessThan(30);
  });

  it("flags the values that mean extraction failed", () => {
    for (const m of [
      "",
      "   ",
      "Transaction execution error",
      "transaction execution error",
      "[object Object]",
      "undefined",
      "null",
      "error",
      "unknown error",
    ]) {
      expect(isUninformative(m), `expected ${JSON.stringify(m)} to be uninformative`).toBe(true);
    }
  });
});
