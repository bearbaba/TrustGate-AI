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

## Upstash already provisioned on Vercel

The application now also accepts **Vercel Marketplace Upstash credentials** automatically when the database is attached to the TrustGate AI project:
- `UPSTASH_REDIS_REST_URL` together with `UPSTASH_REDIS_REST_TOKEN`
- Legacy `KV_REST_API_URL` together with `KV_REST_API_TOKEN`

The original explicit `TRUSTGATE_X402_REDIS_URL` and `TRUSTGATE_X402_REDIS_TOKEN` remain supported. Pairs are matched; a URL from one database is never silently combined with a token from another database.

**Redis Production is connected (verified 2026-11-21).** The dedicated Upstash REST credentials are configured as encrypted `TRUSTGATE_X402_REDIS_URL` and `TRUSTGATE_X402_REDIS_TOKEN` in Vercel Production. The public `/api/x402/status` no longer lists `DURABLE_ATOMIC_REPLAY_STORE` as missing. A concurrent 1-of-4 reservation test was previously reported successful; this is not proof of an on-chain payment. The Redis credentials remain private and are not committed.

A Redis connection, once attached, only marks the replay-store prerequisite ready. **Do not enable actual transactions until the sponsored facilitator, V1 sender-signing client, and independent payment verification work end-to-end.**

## Sponsor public account — configured on Vercel Production

The public Concordium Testnet sponsor address supplied on 2026-11-21 is:

`4Q9ZNet1wKBCS3HWYxBSrHjKPfyois52h3gYUUHKe8Fw4Cf3s3`

It has a valid Concordium Base58Check checksum (version 1), differs from Agent #1323 owner and Merchant, and is stored as `TRUSTGATE_FACILITATOR_SPONSOR_ADDRESS` in Vercel Production. **This does not demonstrate that the account exists on-chain, is funded, or that the server has signing authority.** The private signing key remains deliberately absent. No CCD has been sent, and settlement remains disabled.

**Protocol compatibility correction:** official `@x402/concordium/exact/client` constructs `paymentPayload.payload.signedTransaction.header.sender`; a separate `paymentPayload.payload.sender` field is not required. The Gateway and Sponsor now validate the official nested sender and sponsor header without requiring a nonstandard field. Cryptographic sender-signature verification remains the responsibility of the Concordium facilitator SDK.

## Optional first-party Concordium Testnet facilitator (source-level v0.8)

The official x402.org public development facilitator currently does **not advertise** the Concordium Testnet CAIP-2 network in its published supported list. A small first-party sponsor service is included at `/api/sponsor/*`, using the official `@x402/core/facilitator` and `@x402/concordium/exact/facilitator` SDK. These routes are **disabled until configured**. No sponsor signing key has been generated, installed or funded automatically; no on-chain payment has been executed.

- `GET /api/sponsor/status`: public readiness (never returns secrets)
- `GET /api/sponsor/supported`: authenticated real `/supported` response from official SDK
- `POST /api/sponsor/verify`: authenticated cryptographic verification of a restricted Testnet payment
- `POST /api/sponsor/settle`: authenticated sponsored settlement, **only after** exact sender, merchant, fee payer, CCD amount and Testnet scheme checks

The service refuses all payment calls unless all conditions are met:
1. The TrustGate merchant is configured.
2. A third, dedicated **Concordium Testnet sponsor account**, distinct from the owner and merchant accounts, has been created and funded with **test CCD for fees**.
3. The sponsor's Ed25519 private key is managed exclusively in Vercel encrypted environment variables — **never** paste or commit it to GitHub, public deployment, chat or page.
4. A strong random API bearer secret is set privately. Resource-server calls to the first-party facilitator use the corresponding authorization header.
5. The separate `TRUSTGATE_FACILITATOR_ENABLED=testnet` and `TRUSTGATE_X402_ENABLED=testnet` switches are explicitly enabled **only after** a safety review.
6. Shared Redis is functional, and outbound Concordium Testnet gRPC can complete verification and finalization within the hosting runtime limits.

Encrypted Production variables, to be set only when ready:

| Key | Purpose |
|---|---|
| `TRUSTGATE_FACILITATOR_SPONSOR_ADDRESS` | Third Testnet account (public) |
| `TRUSTGATE_FACILITATOR_SPONSOR_PRIVATE_KEY` | Sponsor Ed25519 secret; use encrypted Vercel env, never share |
| `TRUSTGATE_FACILITATOR_AUTH_TOKEN` | Strong unique bearer secret for `/supported`, `/verify`, `/settle` |
| `TRUSTGATE_X402_FACILITATOR_URL` | `https://trustgate-ai.vercel.app/api/sponsor` (first-party only) |
| `TRUSTGATE_FACILITATOR_ENABLED` | `testnet`, after review |
| `TRUSTGATE_X402_ENABLED` | `testnet`, after review |

**Important:** This is a source-level facilitator implementation, not a completed live payment system. We have not verified Vercel runtime gRPC settlement, and the separate sender-signing client remains to be implemented. Before enabling public sponsored settlement, include abuse controls, operator incident response, independent transaction verification, rate limiting, and a bounded sponsor balance. The first-party settle and resource functions allow up to 120 seconds on Vercel Fluid Compute, while the HTTP facilitator request has a 75-second deadline. Vercel function timeouts during settlement can produce an *ambiguous outcome*, leaving replay reservations locked for manual reconciliation. Do not claim real payment success without a block-explorer-confirmed Testnet transaction.

## Sponsor abuse limits (source-level safeguard; not yet enabled on Production)

Once the sponsor endpoints are explicitly enabled, every authenticated `/supported`, `/verify` and `/settle` call must obtain an atomic Redis quota before executing the x402 SDK. Quotas are shared across Vercel instances, not per-instance in-memory counters:

| Endpoint | Total per one-minute bucket |
|---|---:|
| `GET /api/sponsor/supported` | 30 |
| `POST /api/sponsor/verify` | 24 |
| `POST /api/sponsor/settle` | 4 |

A single Upstash `EVAL` performs `INCR` and sets an expiry for each global counter. Exceeded quotas return HTTP 429. Redis errors or ambiguous results return HTTP 503 and never invoke sponsor signing. Limits intentionally favor this single-owner Testnet demo, not public payment throughput. Counters contain no personal identifiers or credentials. This control does **not** replace spending caps, key custody, transaction reconciliation, or monitoring; only authorize sponsorship after all those controls are reviewed. No sponsor gas or payment is charged by this readiness work.

## Important limitations and required manual tests

- The public browser page is a **readiness and quote inspector**, not a client that signs Concordium V1 sponsored transfers. A future paying client must use the official `@x402/concordium/exact/client` scheme in an owner-controlled secure wallet environment. Never enter a wallet private key on this page.
- The HTTP 402 and settlement paths have mock-backed automated tests. **No real Testnet payment has yet been made or observed in CCDExplorer**.
- A single atomic Upstash Redis Lua `EVAL` reserves the intent and payment keys together; the settlement record transition is also atomic and conditioned on both keys remaining reserved. An ambiguous settlement leaves locks in place and requires **manual transaction reconciliation**. This is deliberately fail-closed. There is no automated recovery portal yet.
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
- [x] **Atomic Redis Lua EVAL** reserving both nonce/payment keys and atomically persisting settlement (requires real Redis smoke test after connecting)
- [x] Mock-backed tests of 402, verify, replay rejection and settlement prerequisite
- [x] Merchant Testnet public address supplied and saved to Vercel Production (checksum validated; on-chain existence/ownership not independently verified)
- [x] First-party official SDK facilitator source and authorization gates (v0.8, **locked, not funded or live tested**)
- [x] Distinct third Testnet sponsor **public account address** configured on Vercel (checksum validated, not proven funded)
- [ ] Sponsor funded with test CCD, securely installed signing key, and real `/supported` smoke test
- [x] Secure Redis credentials connected to Vercel Production (reconciliation plan still required)
- [ ] Paying client with owner-controlled V1 sponsored transaction signing
- [ ] Actual successful Testnet transfer to merchant, on-chain transaction independently verified
- [ ] Operational monitoring, reconciliation, rate limiting and independent settlement check
- [ ] Accurate hackathon video showing real 402 → sponsor-settled CCD → paid resource

The current project may demonstrate the **ready-to-integrate software structure** but MUST NOT claim payment execution or full x402 completion yet.
