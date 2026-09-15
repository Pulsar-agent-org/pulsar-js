// The spec version this package implements. CI checks that the vendored
// conformance vectors in conformance/PIN.json carry the same version, so a
// vector set from a different spec release cannot pass silently.
export const SPEC_VERSION = "0.1.0";

// Clock-skew grace applied only at the nonce expiry boundary, in seconds.
// Fixed by the spec and by the conformance runner contract.
export const SKEW_SECONDS = 5;
