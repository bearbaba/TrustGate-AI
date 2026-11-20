# TrustGate AI

**Verify before you authorize.** A Concordium CIS-8004 native agent identity + fail-closed deterministic payment-intent review prototype, built for the Concordium Trusted Agents Hackathon 2026.

- Live demo: https://trustgate-ai.vercel.app/
- **Live signed evidence flow:** https://trustgate-ai.vercel.app/live-proof
- **Adversarial Security Lab:** https://trustgate-ai.vercel.app/security-lab
- **x402 Testnet Gateway (locked until configured):** https://trustgate-ai.vercel.app/x402-gateway
- Agent #1323 metadata management: https://trustgate-ai.vercel.app/sign-agent
- Source: https://github.com/bearbaba/TrustGate-AI
- **On-chain proof:** [Successful Testnet setAgentURI transaction](https://ccdexplorer.io/testnet/transaction/93280aa5361967fc656e513e824c495c932c2abdc4cd7253bf3f2db35d90f4ee)
- Testnet Agent: `ccd:4221332d34e1694168c2a0c0b3fd0f27/cis-2:JyP9UhV91L3jWGjHH4aB7`
- Agent Card: https://trustgate-ai.vercel.app/.well-known/agent-card.json
- Agent Card hash: `ed33956577d378ef0bfd537505863d846a2c130513302a2d45d99e5bfc009c44`

## Verified on-chain milestone — 2026-11-20

The owner wallet signed an update to `CIS-8004.setAgentURI` on Testnet registry `<12802,0>`, setting both the Agent Card URL and its SHA-256. CCDExplorer reports **Account Transaction Success** and `CIS-8004.uri_updated` at block **51,056,295**. The official check-badge response was subsequently captured: badge_valid=true, checks.extension_conformant=true, checks.verification_present=true, checks.hash_matches_on_chain=true, and issues=[]. The on-chain badge and card integrity are now verified.

Read [the on-chain evidence and badge verification record](docs/ONCHAIN_EVIDENCE.md) for transaction hash, scope and verification command. A separate [Live Proof evidence log](docs/LIVE_PROOF_EVIDENCE.md) records successful v0.3 and v0.4 owner-wallet tests, including the v0.4 five-check receipt re-verification.

> **Prototype: no payment execution.** The app's `ALLOW` result is a deterministic policy decision, not permission granted to a wallet or a payment settlement. The site offers a single owner-controlled Testnet metadata update; it does not sign payments, transfer funds, implement x402 settlement, or persist audit records on-chain.

## Live ownership-bound evidence flow (v0.5)

The [Live Proof page](https://trustgate-ai.vercel.app/live-proof) demonstrates an end-to-end sequence:

1. Connect the Concordium Testnet wallet that owns Agent #1323.
2. Sign an intent-specific message with a fresh client nonce and 90-second validity window (**no gas**).
3. The backend verifies the signature against the account's current on-chain signing keys via Concordium Testnet gRPC and calls the official CIS-8004 badge resolver.
4. A deterministic policy evaluates the hypothetical USD amount. ALLOW returns a fresh public on-chain evidence receipt, REVIEW/BLOCK return no receipt.
5. Export a **v0.5 Policy Witness** receipt containing the owner-signed request, independently reproducible policy manifest fingerprint and decision, plus a SHA-256 digest. The Verify Receipt panel recalculates policy, signature and current registry checks. v0.4 receipts remain supported as **legacy owner-signature proofs** without policy-witness validation. A prior v0.3 receipt without the signed request cannot be independently verified.

For REVIEW and BLOCK, the wallet and badge are still verified before returning the policy result; no evidence receipt is issued. No amount is charged. The wallet's signature is limited to one **read-only public evidence request**, not a transaction, delegated authorization, durable access token, or x402 payment. Because the prototype has no durable nonce registry, the same signed request could be replayed during its short validity window: do not use this workflow to protect paid or write-sensitive actions. Adding replay protection and persistent audit storage is required before enabling actual services or funds.

**Reproducible policy evidence:** The [Policy Witness specification](docs/POLICY_WITNESS.md) explains why a hash alone does not stop forged JSON, how verifier policy re-execution works, and what the [Attack Lab](https://trustgate-ai.vercel.app/security-lab) can demonstrate. Even with a valid witness, a backend-signed historical decision and durable nonce protection are NOT implemented.

The authenticated service is deliberately **public/read-only**. It demonstrates a genuine wallet-ownership proof, fresh badge resolution and policy-gated evidence delivery, but does not claim a paid integration.

## x402 Testnet gateway (v0.7 — disabled until configured)

The x402 gateway now contains a **source-level testnet resource endpoint**, using the official `@x402/core` and `@x402/concordium` sponsored-transaction server scheme. It checks a separate owner-signed exact-chain, exact-merchant, exact-price intent; verifies Agent #1323; issues an official HTTP 402 challenge only after a real facilitator /supported handshake; verifies a sponsored payment payload; and requires atomic shared replay locks before settlement.

**The live environment is not yet configured for merchant payments, and NO actual x402 payment has been demonstrated.** A second merchant Testnet wallet, a compatible sponsor/facilitator and shared durable Redis are required. The public page deliberately shows a LOCKED gateway until those are set. A wallet `signMessage` is not a payment signature; client-side sponsored transaction signing is also still to be built.

Read [the gateway setup and safety checklist](docs/X402_GATEWAY_SETUP.md). Do not fund or deploy mainnet. Never put private keys in this repo.

## Production path: real x402 settlement

A genuine Concordium x402 flow has **not** been implemented. The official `@x402/concordium` package supports client, server and facilitator components; however, TrustGate cannot claim agent payments or payment authorization without an actual Testnet settlement to a separate receiving account and a verifiable transaction receipt. The [x402 integration checklist](docs/X402_INTEGRATION_PLAN.md) records the necessary steps and strict acceptance criteria.

**Owner-confirmed live test:** A fresh v0.5 Policy Witness receipt was verified on Production on 2026-11-20 at `11:47:33Z`: `SIGNED_REQUEST_POLICY_AND_BADGE_VERIFIED`, with all six checks true (integrity, request binding, policy, owner signature, registry and Agent Card). See [Live Proof evidence](docs/LIVE_PROOF_EVIDENCE.md). The Production Attack Lab was subsequently owner-tested: original receipt ACCEPTED and forged policy, signature, and metadata each REJECTED with the expected codes (4/4). See [Live Proof evidence](docs/LIVE_PROOF_EVIDENCE.md).

## Independent third-party verification (v0.6)

Reviewers can check an actual downloaded Policy Witness receipt **without trusting our hosted `/api/verify-receipt` endpoint**. The new offline/live CLI runs from the public GitHub source:

```sh
node scripts/verify-receipt.mjs path/to/receipt.json --offline
node scripts/verify-receipt.mjs path/to/receipt.json --live
```

Offline mode independently checks receipt structure, SHA-256 and policy logic, but **cannot verify who signed the request or what is currently on-chain**. Live mode independently queries Concordium Testnet gRPC and the official CIS-8004 badge verifier; it does not call TrustGate's website. See [independent verification instructions](docs/INDEPENDENT_VERIFICATION.md).

Neither mode proves the server originally issued the receipt. Enabling a server-signed issuance attestation and durable atomic nonce store requires secure environment configuration and persistent storage; neither is deployed.

## Start locally

Requires Node.js 22 and npm. The signer and live proof pages use esbuild bundles. The proof backend requires outbound Concordium Testnet gRPC connectivity.

```sh
npm install
npm run build
npm run dev
# open http://localhost:3000
npm test
npm run check
```

## API

- `GET /api/x402/status` reports readiness without disclosing secrets; `GET /api/x402/quote` builds official x402 Testnet requirements when configured; `GET /api/x402/resource` protects a paid evidence endpoint and returns HTTP 402 or a settled resource only behind all configured safety gates. **No live payment has been confirmed**.
- `GET /api/verify?badge=BASE58TOKEN` checks a badge with Concordium's server-side resolver. Verification fails closed if a mandatory check is absent or registry is unavailable.
- `POST /api/live-proof` accepts signed, time-bounded Testnet requests for Agent #1323 and returns a public evidence receipt only after signature, badge and policy checks.
- `POST /api/verify-receipt` checks v0.5 receipt SHA-256, **recomputed policy witness**, owner-signed request and the current badge. v0.4 legacy receipts can verify owner signature and current badge without policy witness. This is not a server-signed historical timestamp or authorization token.
- `POST /api/evaluate` accepts JSON with `badge`, `amountUsd` (for example `"2.00"`), `recipient` and `purpose`. Returns `ALLOW`, `REVIEW` or `BLOCK`, with auditable reasons.

Recipient allowlist: `research-api`, `evidence-oracle`, `audit-service`. Amounts below $5: `ALLOW` (policy only); $5–$10: `REVIEW`; above $10: `BLOCK`. Invalid inputs and unverified identities: `BLOCK`.

Browser-session audit records have SHA-256 integrity digests and can be exported as JSON. They are **not** anchored on-chain.

## Agent Card integrity

```sh
curl -LfsS https://trustgate-ai.vercel.app/.well-known/agent-card.json | sha256sum
```

Expected hash: `ed33956577d378ef0bfd537505863d846a2c130513302a2d45d99e5bfc009c44`. **Do not edit the served Agent Card without an intentional new on-chain metadata hash update.**

## Roadmap and submission

See [docs/ROADMAP.md](docs/ROADMAP.md) and [the silent demo storyboard](docs/DEMO_STORYBOARD.md). The hackathon requires a public repository, demo evidence, and a short video. Check the current programme's deadlines and eligibility before submission.

- Official reference: https://docs.concordium.com/en/mainnet/technical-reference/agent-registry/mcp-service.html
- Programme: https://www.concordium.com/article/concordium-trusted-agents-hackathon-encode-club
