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

## Testing checklist

- [x] v0.3 ALLOW completed with owner wallet on Production, receipt returned
- [ ] v0.4 ALLOW completed with owner wallet; download and independently verify JSON
- [ ] v0.4 REVIEW ($6) completed with owner wallet and no receipt issued
- [ ] v0.4 BLOCK ($12) completed with owner wallet and no receipt issued

All amounts are *hypothetical policy inputs*, not payments. No x402 or real spending has been implemented.
