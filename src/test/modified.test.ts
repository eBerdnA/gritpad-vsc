import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { formatModifiedTimestamp, getModifiedEdit } from "../modified";

const date = new Date(2026, 9, 30, 9, 48, 1);
const timestamp = formatModifiedTimestamp(date);

for (const quote of ["", "'", '"']) {
  test(`updates only the existing scalar, preserving ${quote || "plain"} quoting and content`, () => {
    const source = `\uFEFF---\r\ntitle: Note\r\nmodified: ${quote}2000-01-01 00:00:00 +0000${quote} # keep comment\r\nother: unchanged\r\n---\r\nBody modified: untouched\r\n`;
    const result = getModifiedEdit(source, date);
    assert.equal(result.error, undefined);
    assert.ok(result.edit);
    const { start, end, text } = result.edit;
    assert.equal(source.slice(0, start) + text + source.slice(end), source.replace("2000-01-01 00:00:00 +0000", timestamp));
  });
}

test("does not add missing properties or touch nested/body properties", () => {
  for (const source of ["No frontmatter", "---\ntitle: Note\n---\nmodified: old", "---\nmeta:\n  modified: old\n---\n"]) {
    assert.deepEqual(getModifiedEdit(source, date), {});
  }
});

test("skips malformed YAML and unsupported scalar forms with an explicit reason", () => {
  for (const yaml of ["modified: [", "modified: old\nmodified: other", "modified: 42", "modified:", "modified: [old]", "modified: |\n  old", "modified: &date old", "modified: !!str old"]) {
    const result = getModifiedEdit(`---\n${yaml}\n---\n`, date);
    assert.ok(result.error, yaml);
    assert.equal(result.edit, undefined, yaml);
  }
});

test("does not create a redundant edit when the timestamp is unchanged", () => {
  assert.deepEqual(getModifiedEdit(`---\nmodified: ${timestamp}\n---\n`, date), {});
});

test("uses local wall time, daylight saving, and non-hour UTC offsets", () => {
  const cases = [
    ["Europe/Berlin", "2026-01-15T12:00:00Z", "2026-01-15 13:00:00 +0100"],
    ["Europe/Berlin", "2026-07-15T12:00:00Z", "2026-07-15 14:00:00 +0200"],
    ["America/New_York", "2026-01-15T12:00:00Z", "2026-01-15 07:00:00 -0500"],
    ["Asia/Kathmandu", "2026-01-15T12:00:00Z", "2026-01-15 17:45:00 +0545"],
    ["UTC", "2026-01-15T12:00:00Z", "2026-01-15 12:00:00 +0000"],
  ];
  for (const [zone, instant, expected] of cases) {
    const script = `console.log(require(${JSON.stringify(require.resolve("../modified"))}).formatModifiedTimestamp(new Date(${JSON.stringify(instant)})))`;
    const result = spawnSync(process.execPath, ["-e", script], { env: { ...process.env, TZ: zone }, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), expected);
  }
});
