# TrustGate AI — Real Concordium x402 Integration Plan

**Status (2026-11-22): Merchant, verified on-chain fee Sponsor, atomic Redis and official x402 exact Testnet quote are configured in Production. Owner-signed HTTP 402 preflight has succeeded, and a local owner-key sender-first client has been implemented and tested offline. No real x402 settlement transaction hash or paid-resource receipt is yet verified.** This checklist defines actual completion, not a simulated payment.

## Why x402 matters

The Concordium Trusted Agents Hackathon evaluates depth of Concordium identity and agent-payment integration, end-to-end usefulness, and a credible path to mainnet. TrustGate currently verifies a native Testnet badge, wallet ownership and read-only policy receipts. It deliberately executes no payment.

The official `@x402/concordium` package is published with client, server and facilitator components:
https://www.npmjs.com/package/@x402/concordium

Official Concordium reference:
https://docs.concordium.com/en/mainnet/how-to/integrations/x402-integration.html

## Proposed uniquely verifiable flow

**"Verified agent pays only after deterministic policy clearance, with a separately verifiable wallet + registry + payment proof."**

1. **Agent identity** — resolve Agent #1323 via the official Concordium registry, ensure Active status and exact pinned Card hash.
2. **Owner signature** — require a service-specific signed intent containing exact resource, payee, price/asset, chain, nonce and expiry. No indefinite spending rights.
3. **Deterministic policy** — ALLOW/REVIEW/BLOCK with a reproducible Policy Witness bound to that signed intent.
4. **x402 HTTP challenge** — a restricted endpoint issues a legitimate 402 Payment Required challenge, including network, asset, recipient, exact charge and resource ID. Only official protocol implementations accepted.
5. **Wallet payment** — client constructs and signs a **real Concordium Testnet transfer** through official `@x402/concordium` integration. The payer sees destination, amount, network and exact scope before approving. No private keys on the TrustGate server.
6. **Facilitator and confirmation** — verify the payment proof and finalized transaction using the official Concordium stack. Check payee, amount, asset, network, transaction status, single-resource idempotency and replay prevention.
7. **Delivery and receipt** — ONLY after confirmed payment and policy compliance, unlock the paid API resource. Return an independently checkable receipt including transaction hash, Agent Card hash, request hash and policy version.

## Security and cost constraints

- Testnet only while under development; Testnet CCD has no mainnet financial value.
- A **separate merchant receiving account** is needed for credible payer-to-seller settlement.
- Sponsored transactions may reduce user-facing gas, but a functioning facilitator/sponsor must be confirmed; do not promise "zero gas" by assumption.
- If the facilitator or replay store is unconfigured, fail closed and do not deliver paid data.
- Use a durable shared store (e.g. a free-tier Redis/Postgres service) for **atomic nonce consumption and payment idempotency** before enabling paid operations. Do not treat an in-memory Map in serverless functions as secure global replay protection.
- Rate-limit request initiation and receipt verification. Validate payload size, content type, timeouts, and external endpoint allowlists. Never forward arbitrary URLs supplied by the client.
- Never store or request the owner's private key, seed phrase or wallet export.

## Acceptance criteria before claiming "x402 integrated"

- [ ] A real Testnet payment to a distinct merchant wallet appears on CCDExplorer.
- [ ] The same payment cannot unlock two different requests or be replayed.
- [ ] Invalid badge, mismatched payee, wrong price, wrong chain and expired intent all fail closed.
- [ ] HTTP 402 response and successful paid response are protocol compliant.
- [ ] A merchant receives the expected Testnet amount with a verifiable settlement reference.
- [ ] Public source/tests/documentation cover receipt verification and operational failure.
- [ ] A filmed end-to-end browser demo demonstrates payer, verifier, facilitator, paid resource delivery and on-chain transaction.

If any of these are not achieved, describe x402 as **planned**, and submit the existing valid Testnet identity + Policy Witness security product honestly.

## Immediate product differentiator

Until payments are real, the v0.5 [Adversarial Lab](https://trustgate-ai.vercel.app/security-lab) is the completed differentiator: a user can upload a real signed receipt, forge policy/signature/metadata fields, recompute the entire SHA-256 and observe whether the independent verifier rejects the attack at the correct security layer.
