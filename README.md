# TrustGate AI

**Verify before you authorize.** A Concordium CIS-8004 native agent identity + fail-closed deterministic payment-intent review prototype, built for the Concordium Trusted Agents Hackathon 2026.

- Live demo: https://trustgate-ai.vercel.app/
- **Live signed evidence flow:** https://trustgate-ai.vercel.app/live-proof
- Agent #1323 metadata management: https://trustgate-ai.vercel.app/sign-agent
- Source: https://github.com/bearbaba/TrustGate-AI
- **On-chain proof:** [Successful Testnet setAgentURI transaction](https://ccdexplorer.io/testnet/transaction/93280aa5361967fc656e513e824c495c932c2abdc4cd7253bf3f2db35d90f4ee)
- Testnet Agent: `ccd:4221332d34e1694168c2a0c0b3fd0f27/cis-2:JyP9UhV91L3jWGjHH4aB7`
- Agent Card: https://trustgate-ai.vercel.app/.well-known/agent-card.json
- Agent Card hash: `ed33956577d378ef0bfd537505863d846a2c130513302a2d45d99e5bfc009c44`

## Verified on-chain milestone — 2026-11-20

The owner wallet signed an update to `CIS-8004.setAgentURI` on Testnet registry `<12802,0>`, setting both the Agent Card URL and its SHA-256. CCDExplorer reports **Account Transaction Success** and `CIS-8004.uri_updated` at block **51,056,295**. The official check-badge response was subsequently captured: badge_valid=true, checks.extension_conformant=true, checks.verification_present=true, checks.hash_matches_on_chain=true, and issues=[]. The on-chain badge and card integrity are now verified.

Read [the on-chain evidence and badge verification record](docs/ONCHAIN_EVIDENCE.md) for transaction hash, scope and verification command.

> **Prototype: no payment execution.** The app's `ALLOW` result is a deterministic policy decision, not permission granted to a wallet or a payment settlement. The site offers a single owner-controlled Testnet metadata update; it does not sign payments, transfer funds, implement x402 settlement, or persist audit records on-chain.

## Live ownership-bound evidence flow (v0.4)

The [Live Proof page](https://trustgate-ai.vercel.app/live-proof) demonstrates an end-to-end sequence:

1. Connect the Concordium Testnet wallet that owns Agent #1323.
2. Sign an intent-specific message with a fresh client nonce and 90-second validity window (**no gas**).
3. The backend verifies the signature against the account's current on-chain signing keys via Concordium Testnet gRPC and calls the official CIS-8004 badge resolver.
4. A deterministic policy evaluates the hypothetical USD amount. ALLOW returns a fresh public on-chain evidence receipt, REVIEW/BLOCK return no receipt.
5. Export a JSON receipt containing the owner-signed request and SHA-256 integrity digest; the **Verify Receipt** panel can recompute the digest, verify the signature against Testnet credentials, and compare against **current** registry state. A prior v0.3 receipt without the signed request cannot be independently verified.

For REVIEW and BLOCK, the wallet and badge are still verified before returning the policy result; no evidence receipt is issued. No amount is charged. The wallet's signature is limited to one **read-only public evidence request**, not a transaction, delegated authorization, durable access token, or x402 payment. Because the prototype has no durable nonce registry, the same signed request could be replayed during its short validity window: do not use this workflow to protect paid or write-sensitive actions. Adding replay protection and persistent audit storage is required before enabling actual services or funds.

The authenticated service is deliberately **public/read-only**. It demonstrates a genuine wallet-ownership proof, fresh badge resolution and policy-gated evidence delivery, but does not claim a paid integration.

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

- `GET /api/verify?badge=BASE58TOKEN` checks a badge with Concordium's server-side resolver. Verification fails closed if a mandatory check is absent or registry is unavailable.
- `POST /api/live-proof` accepts signed, time-bounded Testnet requests for Agent #1323 and returns a public evidence receipt only after signature, badge and policy checks.
- `POST /api/verify-receipt` checks v0.4 receipt SHA-256, the actual signed owner request, and the **current** on-chain badge. This is not a server-signed historical timestamp or authorization token.
- `POST /api/evaluate` accepts JSON with `badge`, `amountUsd` (for example `"2.00"`), `recipient` and `purpose`. Returns `ALLOW`, `REVIEW` or `BLOCK`, with auditable reasons.

Recipient allowlist: `research-api`, `evidence-oracle`, `audit-service`. Amounts below $5: `ALLOW` (policy only); $5–$10: `REVIEW`; above $10: `BLOCK`. Invalid inputs and unverified identities: `BLOCK`.

Browser-session audit records have SHA-256 integrity digests and can be exported as JSON. They are **not** anchored on-chain.

## Agent Card integrity

```sh
curl -LfsS https://trustgate-ai.vercel.app/.well-known/agent-card.json | sha256sum
```

Expected hash: `ed33956577d378ef0bfd537505863d846a2c130513302a2d45d99e5bfc009c44`. **Do not edit the served Agent Card without an intentional new on-chain metadata hash update.**

## Roadmap and submission

See [docs/ROADMAP.md](docs/ROADMAP.md). The hackathon requires a public repository, demo evidence, and a short video. Check the current programme's deadlines and eligibility before submission.

- Official reference: https://docs.concordium.com/en/mainnet/technical-reference/agent-registry/mcp-service.html
- Programme: https://www.concordium.com/article/concordium-trusted-agents-hackathon-encode-club
