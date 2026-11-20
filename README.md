# TrustGate AI

**Verify before you authorize.** A Concordium CIS-8004 native agent identity + fail-closed deterministic payment-intent review prototype, built for the Concordium Trusted Agents Hackathon 2026.

- Live demo: https://trustgate-ai.vercel.app/
- Agent #1323 metadata management: https://trustgate-ai.vercel.app/sign-agent
- Source: https://github.com/bearbaba/TrustGate-AI
- **On-chain proof:** [Successful Testnet setAgentURI transaction](https://ccdexplorer.io/testnet/transaction/93280aa5361967fc656e513e824c495c932c2abdc4cd7253bf3f2db35d90f4ee)
- Testnet Agent: `ccd:4221332d34e1694168c2a0c0b3fd0f27/cis-2:JyP9UhV91L3jWGjHH4aB7`
- Agent Card: https://trustgate-ai.vercel.app/.well-known/agent-card.json
- Agent Card hash: `ed33956577d378ef0bfd537505863d846a2c130513302a2d45d99e5bfc009c44`

## Verified on-chain milestone — 2026-11-20

The owner wallet signed an update to `CIS-8004.setAgentURI` on Testnet registry `<12802,0>`, setting both the Agent Card URL and its SHA-256. CCDExplorer reports **Account Transaction Success** and `CIS-8004.uri_updated` at block **51,056,295**. Full badge API verification is still a separate check; do not confuse a successful URI update with confirmation that all badge checks are green.

Read [the on-chain evidence record](docs/ONCHAIN_EVIDENCE.md) for transaction hash, scope and verification command.

> **Prototype: no payment execution.** The app's `ALLOW` result is a deterministic policy decision, not permission granted to a wallet or a payment settlement. The site offers a single owner-controlled Testnet metadata update; it does not sign payments, transfer funds, implement x402 settlement, or persist audit records on-chain.

## Start locally

Requires Node.js 22 and npm. The signer page uses an esbuild bundle.

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
