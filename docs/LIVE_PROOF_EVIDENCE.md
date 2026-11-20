# Live Proof — confirmed owner-wallet test

Date: 2026-11-20 · Concordium Testnet

## Successful v0.3 Live Proof (observed on Production)

The owner provided the actual result from https://trustgate-ai.vercel.app/live-proof after confirming a **Concordium Wallet signed message**. The backend successfully validated the signature, checked live Agent #1323 badge, applied the policy and delivered a public read-only evidence receipt.

- Decision: `ALLOW`
- Reasons: `OWNER_SIGNATURE_VALID`, `ONCHAIN_BADGE_VERIFIED`, `POLICY_PASSED`
- Registry checked: `2026-11-20T11:02:48.626Z`
- Agent: `JyP9UhV91L3jWGjHH4aB7` (#1323)
- Owner: `34C1ozW8edKtBmA8FUFoR4aBys8ofuwtRmYqqbzNVPAsATT4wk`
- Agent Card: https://trustgate-ai.vercel.app/.well-known/agent-card.json
- Anchored SHA-256: `ed33956577d378ef0bfd537505863d846a2c130513302a2d45d99e5bfc009c44`
- Request nonce: `27a79ec202e32247de3f0f15daad9c7b`
- Receipt digest: `1f1a0c61ee7c9ce3b59bfc57716fd5daddf95883c04a6301299ea5bac2c08398`
- Hypothetical policy amount: `$1.00`; service: `evidence-oracle`
- Scope: `PUBLIC_READ_ONLY`; no funds were transferred

This is a user-observed successful *live* run, not merely a CI fixture. The v0.3 result **did not** include the complete signed request and owner signature in the exported receipt and therefore cannot be retrospectively validated with the new v0.4 independent verifier.

## v0.4 improved evidence receipts

New receipts contain a copy of the signed request and signature, their SHA-256 integrity digest, and the current badge proof snapshot. The **Verify Receipt** panel rechecks the signature against Concordium Testnet account credentials and the current registry status. It does **not** establish a server-signed historical timestamp or non-repudiable proof of issuance. Re-validation of older receipts may fail if credentials or badge metadata have changed.

## Successful v0.4 receipt re-verification (observed on Production)

The owner ran the updated live flow at https://trustgate-ai.vercel.app/live-proof and then uploaded the newly downloaded receipt to **04 / Verify a downloaded receipt**. Both steps succeeded according to the owner-shared Production output.

**Issuance — observed results**

- Outcome: `ALLOW`
- Reasons: `OWNER_SIGNATURE_VALID`, `ONCHAIN_BADGE_VERIFIED`, `POLICY_PASSED`
- Receipt format: `trustgate-public-receipt/v1`
- Registry checked: `2026-11-20T11:11:21.761Z`
- Registered Agent: `#1323` (`JyP9UhV91L3jWGjHH4aB7`)
- Request nonce: `46fccfa3483eceb704683643dc77728a`
- Signed request issued at: `1795173075205` (milliseconds since Unix epoch)
- Hypothetical amount: `$1.00` — not charged
- Evidence scope: `PUBLIC_READ_ONLY`
- Receipt digest: `9afe8a044724d90041a692aa15f6a211aff35b4102a8317a1cab1009b1da1f19`
- The downloaded receipt contains the original scoped request and the owner signature.

**Independent receipt re-verification — observed results**

- `ok: true`
- `code: OWNER_SIGNATURE_AND_CURRENT_BADGE_VERIFIED`
- `checks.integrity: true`
- `checks.requestBinding: true`
- `checks.ownerSignature: true`
- `checks.currentRegistry: true`
- `checks.currentCardMatch: true`
- Verified at `2026-11-20T11:11:39.084Z`
- Registry checked at `2026-11-20T11:11:38.671Z`

The owner provided the complete results in the project discussion. The wallet signature itself is deliberately **not duplicated into this public Markdown proof record**. The digest and nonce above allow identifying the observed run; for cryptographic reproduction, retain the original downloaded JSON receipt locally.

**Limit:** Reverification proves an owner-signed read-only request and the current badge state. It does **not** independently certify server issuance time, replay resistance, non-repudiable publication, service payment, or execution of any transfer.

## Testing checklist

- [x] v0.3 ALLOW completed with owner wallet on Production, receipt returned
- [x] v0.4 ALLOW completed with owner wallet; download and independently verify JSON (all 5 checks true, 2026-11-20)
- [ ] v0.4 REVIEW ($6) completed with owner wallet and no receipt issued
- [ ] v0.4 BLOCK ($12) completed with owner wallet and no receipt issued

All amounts are *hypothetical policy inputs*, not payments. No x402 or real spending has been implemented.
