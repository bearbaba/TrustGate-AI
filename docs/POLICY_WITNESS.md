# TrustGate Policy Witness — executable evidence

## Why this is different

A hash proves that bytes have not changed relative to that hash; **anyone can recompute a new hash** after editing JSON. Therefore, a raw SHA-256 receipt alone cannot prove a TrustGate policy decision.

Policy Witness v0.5 adds a machine-checkable policy snapshot tied to the wallet-signed intent. The verifier evaluates the supplied intent using the current, reviewed policy implementation and checks that the evidence's policy decision, parameters, version, rationale and SHA-256 manifest fingerprint all agree.

A third party can run the [Adversarial Lab](https://trustgate-ai.vercel.app/security-lab) with a downloaded v0.5 receipt, recompute integrity checksums after deliberately modifying fields, and see whether the backend catches the signature/policy/on-chain inconsistency.

## Verification layers

1. **Integrity** — canonical SHA-256 over receipt JSON (detects accidental corruption, not forgery by itself).
2. **Request binding** — nonce, service, amount, purpose and account match the signed message.
3. **Policy witness** — recompute the documented policy; reject invalid decision/manifest/reasons even if the attacker recomputed SHA-256.
4. **Wallet signature** — verify Concordium owner account signature over the scoped request against current on-chain credentials.
5. **Registry** — verify Active native Agent #1323 via Concordium official resolver.
6. **Agent Card** — require the current on-chain metadata hash to match the pinned hosted Agent Card.

## Boundaries

- This is an **owner-signed read-only request**, not a server-signed historical attestation.
- A valid verifier result does NOT independently establish the time or identity of the server which issued a receipt.
- The verifier evaluates the **current** policy manifest; a future policy update may cause old receipts to become legacy/incompatible.
- v0.4 receipts remain verifiable for signature+badge with a clearly reported **legacy/no-policy-witness** status.
- This proof is **not** an x402 charge, payment approval, transaction settlement, or replay-proof access token.
- Client-generated nonces expire after 90 seconds, but there is no durable replay prevention yet. Do not gate sensitive write actions on this prototype.

## Owner-confirmed production evidence

On 2026-11-20, Agent #1323 completed a live v0.4 owner-signed Testnet request and verified all five then-current receipt checks. See [Live Proof Evidence](LIVE_PROOF_EVIDENCE.md).

The new policy witness and Adversarial Lab are release features to be validated separately on Production. Neither is described as having passed an owner-wallet production test until that test is actually performed.
