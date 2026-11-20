# TrustGate AI — Concordium Testnet x402 Gateway (v0.7)

**Status: Testnet Merchant public address configured in Vercel Production; gateway remains LOCKED and no payment has been executed.**

The gateway uses the official `@x402/core@2.31.0` and `@x402/concordium@2.31.0` packages for the Concordium `exact` scheme. It is intentionally disabled on the public deployment until all necessary Testnet configuration exists. It must not be presented as real payment settlement before a transaction is verified.

## Actual Concordium sponsored-transaction protocol

According to the [official x402 Concordium README](https://github.com/x402-foundation/x402/blob/main/typescript/packages/mechanisms/concordium/README.md), the client signs a V1 sponsored transaction, the facilitator verifies nine rules and signs as sponsor, then settles/finalizes on Concordium Testnet. The client **does not broadcast** directly. An ordinary wallet `signMessage` request proves identity, **not** transaction authorization.

Concordium Testnet: `ccd:4221332d34e1694168c2a0c0b3fd0f27`

Native token: `CCD`, amount `100000` microCCD = **0.1 Testnet CCD**. This is NOT $0.10 or an exchange-rate estimate.

## Implementation

- `GET /api/x402/status`: public health/readiness view, no payments and no secrets
- `GET /api/x402/quote`: if fully configured, uses the official scheme, real facilitator `/supported`, creates real `PaymentRequirements` with sponsored `feePayer`. Does not charge.
- `GET /api/x402/resource`: always fails closed when unconfigured. When configured, requires a valid owner-signed **scoped Testnet payment intent** binding chain, merchant, exact amount and resource, plus fresh Agent #1323 CIS-8004 verification.
- Without a payment payload, a verified requester receives **HTTP 402** with a `PAYMENT-REQUIRED` base64 header containing the official protocol requirements.
- With `PAYMENT-SIGNATURE`, the server verifies the official payment payload against exact requirements, reserves the signed nonce and payment payload atomically in the **shared Redis** replay store, and calls facilitator settlement. Only after successful finalization and persistence does it return `PAID_VERIFIED_AGENT_EVIDENCE` with the on-chain transaction ID and the protocol `PAYMENT-RESPONSE` header.

**No wallet private key, seed phrase or sponsor signing key is ever stored in this repository or requested by the UI.**

## Verified Merchant address

Public Merchant Testnet account (separate from Agent #1323 owner):

`4XYepvZZJyFkKTTgoTCmNuQYar1PBiscdZBh6cRotsG2Y7SBDf`

This address has valid Concordium Base58Check format and was saved in Vercel Production as `TRUSTGATE_X402_MERCHANT_ADDRESS` on 2026-11-20. The address alone does not establish on-chain existence, ownership, account balance or settlement. No funds were moved. Payment remains locked unless a live facilitator, replay store and explicit enable flag are also configured.

## Required environment variables on Vercel (Production only)

| Name | Value | Sensitivity |
|---|---|---|
| `TRUSTGATE_X402_ENABLED` | `testnet` | Plain |
| `TRUSTGATE_X402_MERCHANT_ADDRESS` | A second **public Concordium Testnet account address**, distinct from Agent #1323 owner | Plain |
| `TRUSTGATE_X402_FACILITATOR_URL` | Official-compatible **HTTPS facilitator** with `/supported`, `/verify` and `/settle`, supporting Concordium Testnet sponsored transactions | Plain |
| `TRUSTGATE_X402_REDIS_URL` | Dedicated HTTPS Upstash Redis REST endpoint | Encrypted |
| `TRUSTGATE_X402_REDIS_TOKEN` | Redis REST token with least-privilege scope | Encrypted |

Never paste the Redis token or wallet private key into chat/GitHub. Configure through Vercel's encrypted environment variable UI. An ordinary public x402 facilitator may **not support Concordium**. The code must reject an unsupported network or missing sponsor.

## Important limitations and required manual tests

- The public browser page is a **readiness and quote inspector**, not a client that signs Concordium V1 sponsored transfers. A future paying client must use the official `@x402/concordium/exact/client` scheme in an owner-controlled secure wallet environment. Never enter a wallet private key on this page.
- The HTTP 402 and settlement paths have mock-backed automated tests. **No real Testnet payment has yet been made or observed in CCDExplorer**.
- An Upstash reservation prevents concurrent/replayed use of an intent and payment payload, but an ambiguous settlement leaves locks in place and requires **manual transaction reconciliation**. This is deliberately fail-closed. There is no automated recovery portal yet.
- Storage must be reliable and atomic; serverless in-memory Maps are insufficient. Rate limits, monitoring and merchant reconciliation should be added before operating a public paid service.
- The response relies on the *configured facilitator's verified and finalized settlement result*. A production launch should independently cross-check transaction finalization with Concordium gRPC and provide settlement observability.
- The unpaid owner-signed message is **not** a transfer authorization. The payment signature must be produced separately by the owner-controlled payment client. Review sponsor and payee before signing.
- Use Testnet CCD only. A real user-controlled signature can transfer Testnet CCD after all prerequisites are explicitly enabled. **No Mainnet signing is supported**.

## User-facing configuration

Open https://trustgate-ai.vercel.app/x402-gateway to inspect readiness. The gateway should report `LOCKED_UNTIL_CONFIGURED` until the second merchant wallet, compatible facilitator and Redis are available. No payment happens by visiting, refreshing status, or inspecting a quote.

## Acceptance checklist

- [x] Fail-closed gate, separate merchant requirement, fixed Testnet CCD unit checks
- [x] Official Concordium x402 server SDK integration, facilitator-supported sponsor discovery
- [x] Scoped wallet-ownership signature distinct from sponsored transfer signature
- [x] Atomic shared nonce/payload reserve and post-settlement persistence code
- [x] Mock-backed tests of 402, verify, replay rejection and settlement prerequisite
- [x] Merchant Testnet public address supplied and saved to Vercel Production (checksum validated; on-chain existence/ownership not independently verified)
- [ ] Compatible sponsored facilitator set up, verified and funded (if required)
- [ ] Secure Redis credentials configured, with a separate reconciliation plan
- [ ] Paying client with owner-controlled V1 sponsored transaction signing
- [ ] Actual successful Testnet transfer to merchant, on-chain transaction independently verified
- [ ] Operational monitoring, reconciliation, rate limiting and independent settlement check
- [ ] Accurate hackathon video showing real 402 → sponsor-settled CCD → paid resource

The current project may demonstrate the **ready-to-integrate software structure** but MUST NOT claim payment execution or full x402 completion yet.
