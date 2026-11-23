# TrustGate AI

**Verify before you authorize.** A Concordium CIS-8004 native agent identity + fail-closed deterministic payment-intent review prototype, built for the Concordium Trusted Agents Hackathon 2026.

- Live demo: https://trustgate-ai.vercel.app/
- **Live signed evidence flow:** https://trustgate-ai.vercel.app/live-proof
- **Adversarial Security Lab:** https://trustgate-ai.vercel.app/security-lab
- **x402 Testnet Gateway (configured, settlement unverified):** https://trustgate-ai.vercel.app/x402-gateway
- Agent #1323 metadata management: https://trustgate-ai.vercel.app/sign-agent
- Source: https://github.com/bearbaba/TrustGate-AI
- **Reproducible public Testnet preflight (4 read-only GETs):** `npm run submission:check` (no wallet, no payment)
- **Hackathon reviewer quickstart (proof vs. pending):** [Evidence & demo guide](docs/REVIEWER_QUICKSTART.md)
- **On-chain proof:** [Successful Testnet setAgentURI transaction](https://ccdexplorer.io/testnet/transaction/93280aa5361967fc656e513e824c495c932c2abdc4cd7253bf3f2db35d90f4ee)
- Testnet Agent: `ccd:4221332d34e1694168c2a0c0b3fd0f27/cis-2:JyP9UhV91L3jWGjHH4aB7`
- Agent Card: https://trustgate-ai.vercel.app/.well-known/agent-card.json
- Agent Card hash: `ed33956577d378ef0bfd537505863d846a2c130513302a2d45d99e5bfc009c44`

## Verified on-chain milestone — 2026-11-20

The owner wallet signed an update to `CIS-8004.setAgentURI` on Testnet registry `<12802,0>`, setting both the Agent Card URL and its SHA-256. CCDExplorer reports **Account Transaction Success** and `CIS-8004.uri_updated` at block **51,056,295**. The official check-badge response was subsequently captured: badge_valid=true, checks.extension_conformant=true, checks.verification_present=true, checks.hash_matches_on_chain=true, and issues=[]. The on-chain badge and card integrity are now verified.

Read [the on-chain evidence and badge verification record](docs/ONCHAIN_EVIDENCE.md) for transaction hash, scope and verification command. A separate [Live Proof evidence log](docs/LIVE_PROOF_EVIDENCE.md) records successful v0.3 and v0.4 owner-wallet tests, including the v0.4 five-check receipt re-verification.

> **Payment boundary:** The Decision Lab's `ALLOW` is a deterministic policy result, never wallet payment authorization. The separate Testnet x402 endpoints are enabled and guarded, but **no payment has yet been independently confirmed as finalized**. No Mainnet support and no silently authorized transfers.

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

## Concordium x402 Testnet — production gateway configured, settlement not yet verified

The gateway uses the **official** `@x402/core@2.31.0` and `@x402/concordium@2.31.0` **exact** scheme. The live resource supports a verified owner-signed access intent and real HTTP 402 payment requirements with an explicit Testnet Sponsor. Payment is **not** claimed until the facilitator verifies the sender's signature, adds its Sponsor signature, submits the CCD transfer, obtains finalization, and an independent Testnet chain read confirms the sender, payee, amount and Sponsor. Redis atomically reserves the intent and payment fingerprint before any settlement attempt.

Production prerequisites **verified** on 2026-11-22: separate Merchant `4XYepvZZJyFkKTTgoTCmNuQYar1PBiscdZBh6cRotsG2Y7SBDf`, separate funded Sponsor `4Q9ZNet1wKBCS3HWYxBSrHjKPfyois52h3gYUUHKe8Fw4Cf3s3`, Sponsor signing key matching the active on-chain credential, official `/supported` handshake, and a dedicated atomic Upstash Redis replay store. The live x402 quote advertises **0.1 Testnet CCD (100000 microCCD)**.

**The first complete x402 payment, finalized transaction hash, and paid-resource receipt are still pending.** A successful HTTP 402 challenge is not proof of funds transferred. Do not describe the product as a completed autonomous payment service before the on-chain payment has been independently checked.

### Two distinct payment paths — do not confuse them

1. **Official sender-first x402 exact:** the client signs only the sender slot of a V1 sponsored transaction; the facilitator verifies, adds the Sponsor signature, submits and finalizes, and only then may the paid resource be issued. A local-owner client is provided in `scripts/x402-exact-local.mjs`. The official client SDK needs an **owner-controlled local account signer**; no Owner key belongs in the hosted page, Vercel, a chat, or the public repository. Concordium Wallet for Web's public API does not currently offer an arbitrary sender-only transaction signing method suitable for this flow.
2. **Native sponsor-first Concordium Wallet checkout:** `/x402-gateway` offers an explicitly approved wallet transaction with Sponsor already signed. The wallet showed a correctly scoped **0.1 Testnet CCD / Free Transaction** review screen during owner testing, but a later signing attempt displayed **`Value is not an integer`**; a subsequent `Signing was rejected` response was due to dismissing the stalled prompt. No transaction hash has yet been independently confirmed. Native checkout is **not** proof of x402 exact settlement. Unknown submissions are guarded against blind retries.

### Local-only official x402 exact acceptance test

Run only on your own computer, never inside a Vercel function or CI. First check production prerequisites without any private key:

```sh
npm install
npm run x402:check
```

For a real **0.1 Testnet CCD** attempt, the client now accepts an **account-only Concordium Testnet export** via the official SDK, or an already available 32-byte Ed25519 account signing key in a temporary local `TRUSTGATE_OWNER_PRIVATE_KEY` environment variable. The export must belong to the registered **Agent #1323 Owner** and live **outside this Git repository**. Do not use a recovery phrase or entire-wallet backup; never send any account private key or export to ChatGPT, websites, GitHub, `.env` commits or Vercel. If you cannot securely access the matching account signing material, skip actual payment. The CLI displays scope and demands explicit confirmation:

```sh
npm run x402:pay -- --wallet-file "C:/path/outside/repository/owner-account.export"
# Or, only when the compatible private key is already available in your local environment:
# npm run x402:pay
```

After confirmation the script builds an Owner-signed access intent, validates the actual HTTP 402 challenge, calls `ExactConcordiumScheme.createPaymentPayload`, sends the resulting `PAYMENT-SIGNATURE` to the resource, and reports a public transaction hash **only if the server returns verified paid evidence**. No automatic retries. On ambiguous settlement, inspect the Owner and Merchant's Testnet chain activity before attempting another transfer. This is a real-payment CLI, not a dry-run or a requirement to share secret material.

The public browser x402 preflight requires only a **non-payment scoped wallet signature** and has already produced `VALID_OFFICIAL_402_CHALLENGE`; it does not transfer funds.

Read the [exact payment setup and recovery guide](docs/X402_GATEWAY_SETUP.md), [x402 integration plan](docs/X402_INTEGRATION_PLAN.md) and [hackathon submission checklist](docs/CONCORDIUM_SUBMISSION.md).

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
