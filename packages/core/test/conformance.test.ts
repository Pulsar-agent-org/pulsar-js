import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { SPEC_VERSION } from "../src/index.js";
import { runVector, type Kind } from "./runner.js";

const conformanceDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "conformance",
);

function load(name: string): any {
  return JSON.parse(readFileSync(join(conformanceDir, name), "utf8"));
}

const pin = load("PIN.json");

describe("pinned spec version", () => {
  it("matches the version this package implements", () => {
    expect(pin.spec_version).toBe(SPEC_VERSION);
  });
});

const files = [
  "header-serialization.json",
  "header-parsing.json",
  "nonce-validation.json",
  "verification-verdicts.json",
];

for (const file of files) {
  const doc = load(file);
  describe(`${file} (${doc.kind})`, () => {
    it("declares the pinned spec version", () => {
      expect(doc.spec_version).toBe(SPEC_VERSION);
    });
    for (const v of doc.vectors) {
      it(v.id, () => {
        expect(runVector(doc.kind as Kind, v.input)).toEqual(v.expect);
      });
    }
  });
}
