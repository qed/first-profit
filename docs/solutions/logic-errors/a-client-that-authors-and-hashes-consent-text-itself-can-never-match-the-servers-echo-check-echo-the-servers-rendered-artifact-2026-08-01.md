---
module: signup
tags: [consent, coppa, api-contract, hashing, cross-service, echo-check, source-of-truth]
problem_type: logic_error
---

# A client that authors + hashes the consent text itself can never satisfy the server's echo-check — echo the server's rendered artifact, don't recompute it

## Problem

First Profit's signup (a Vite SPA) collects verifiable parental consent and POSTs it
to The120's `/api/fp/signup` routes, which record a consent row only if the submission
echoes the exact policy the server rendered. The server's `consentVerdict` refuses
unless `echoedVersion === FP_CONSENT_POLICY.version` **and**
`echoedHash === currentPolicyHash()` (a **sha256 hex** of the server's own policy
text).

The client was built to be self-contained: it hardcoded its own 4-paragraph policy
body, its own version string `"2026-08-01.v1"`, and computed an 8-char **djb2**
fingerprint of *its* text to send as the hash. Every field was subtly wrong against
the server:

- version `"2026-08-01.v1"` vs server `"2026-08-01.1"` (a stray `v`),
- hash: djb2/8-char over the client's text vs sha256/64-char over the server's text —
  a different algorithm over different source bytes.

Result: `consentVerdict` returns `version_mismatch` for **every** submission → no
consent row is written → the downstream `consentGate` sees `missing` → **no child is
ever minted.** 100% of signups fail, and because both repos "have a consent policy"
it looks done in each one alone. The mismatch is invisible until the two sides are
wired together.

## Symptoms

- Two services each independently define "the policy" (text, version, hash) and both
  look internally correct.
- The consuming side does an equality/echo check on a version and/or a content hash,
  and it fails for inputs that a human would call "the same policy."
- The producing side recomputes a hash with its own algorithm, so even after aligning
  the version the hash still can't match (different algo, or different exact bytes —
  a trailing newline, curly vs straight quotes, CRLF).

## Solution

**The server that records the artifact is the source of truth for the artifact. The
client displays it and echoes back the server's own version + hash — it does not
author or recompute them.**

```ts
// WRONG: client authors its own text, version, and a djb2 fingerprint.
const CLIENT_BODY = "...(client's own copy)...";
const version = "2026-08-01.v1";
const hash = djb2(CLIENT_BODY);            // can never equal the server's sha256

// RIGHT: the rendered policy (text + version + hash) is a value the client RECEIVES.
interface RenderedConsentPolicy { namespace; version; hash; method; text }
function ConsentScreen({ policy }: { policy: RenderedConsentPolicy }) { /* render policy.text */ }
function buildSubmission(d) { return { ...d, consent: consentMetaFor(d.policy) }; }  // echoes policy.version/.hash verbatim
```

Interim (before the fetch exists), the client's default policy constant is made
**byte-identical** to the server's text and its hash hardcoded to the **sha256 of that
same string**, verified by a test that recomputes `sha256(text)` and asserts it equals
both the client constant and the server's published value — so any future text drift
fails CI. Then the real wiring has the client **fetch** the rendered policy from the
server at consent time and echo exactly what it received.

## Why This Works

"Consent binds to the rendered version" means the artifact the user saw and the
artifact the server stores must be provably the same object — which only holds if
there is one producer of that object. When the client recomputes the hash, the hash
stops certifying "the server's text" and instead certifies "the client's text," and
the server's echo-check (correctly) rejects it. Echoing the server's own version+hash
makes the check a genuine integrity handshake instead of two independent guesses that
must coincidentally agree on text, version format, AND hash algorithm.

## Prevention

- **For any cross-service echo/handshake on a hashed or versioned artifact, one side
  produces it and the other echoes it.** Never let both sides independently author the
  thing that must be byte-equal. If the consumer verifies `hash(text)`, the producer
  must send the consumer that exact `text` (or just the hash), not compute its own.
- **Match the hash algorithm AND the exact source bytes.** sha256≠djb2, and even same-
  algorithm hashes diverge on a trailing newline, quote style, or line endings. Pin it
  with a test that recomputes the hash from the shared text and asserts equality with
  the other service's published value.
- **Version strings are contract enums — copy them verbatim, don't retype them.** A
  stray `v` (`2026-08-01.v1` vs `2026-08-01.1`) is a total failure, not a cosmetic
  difference; the server compares by equality.
- **Test the contract across the boundary, not just within each side.** Each repo's
  own tests passed; the failure only exists in the composition. A single test that
  asserts the client's echoed version+hash equal the server's `version`/
  `currentPolicyHash()` would have caught all of it.
- Validate every client-side gate against the server's schema bounds while you're
  there (this same review found the client's jurisdiction min-length (1) and missing
  max diverging from the server's `min(2).max(100)` — a client gate looser than the
  server's turns into a generic server reject, not a helpful field error).
