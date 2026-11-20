# TrustGate AI

**Verify before you authorize.** Concordium Verified Agent identity + deterministic payment-intent policy, designed for the Concordium Trusted Agents Hackathon 2026.

> **Prototype. No actual payments.** ALLOW is a policy decision, not a wallet authorization or executed transaction. Agent registration, on-chain transaction proof, x402 settlement and durable audit storage are not yet implemented. Do not use as the sole control protecting real funds.

## Start locally

Requires Node.js 20+; no package installation required.

~~~sh
npm run dev
# open http://localhost:3000
npm test
npm run check
~~~

## API

* GET /api/verify?badge=BASE58TOKEN — checks a badge using official Concordium resolver.
* POST /api/evaluate — JSON body containing badge, amountUsd (e.g. "2.00"), recipient and purpose.

The server never trusts a browser-supplied verification status; it calls the official registry each time. Only documented positive flags (badge_valid, extension_conformant, verification_present), no issues, and no explicit inactive status qualify as verified. All network/schema failures block the request.

Fixed recipient allowlist: research-api, evidence-oracle, audit-service.
Amounts below $5: ALLOW (policy only); $5 to $10: REVIEW; greater than $10: BLOCK. Invalid input and unverified identity: BLOCK.

Audit records have SHA-256 checksums and can be exported by the browser. A checksum **is not an on-chain anchor**, and records are retained only in that browser session.

## Deploy (Vercel)

Import this public repository in Vercel, Framework Preset **Other**, Output Directory **public**, Node.js >=20. Serverless functions in the root api/ directory. No private wallet keys required for this read-only prototype. Verify that both deployed API endpoints actually work before treating deployment as complete.

## Hackathon readiness

See docs/ROADMAP.md. Submit public source, up-to-three-minute video, a CCDExplorer proof link, description and go-live plan by **2026-12-09 23:59 UTC** (2026-12-10 06:59 Vietnam).

Documentation: https://docs.concordium.com/en/mainnet/technical-reference/agent-registry/mcp-service.html

Official brief: https://www.concordium.com/article/concordium-trusted-agents-hackathon-encode-club
