# TrustGate AI — Concordium Testnet x402 Gateway (v0.7)

**Status: Testnet Merchant public address configured in Vercel Production; gateway remains LOCKED and no payment has been executed.**

The gateway uses the official `@x402/core@2.31.0` and `@x402/concordium@2.31.0` packages for the Concordium `exact` scheme. It is intentionally disabled on the public deployment until all necessary Testnet configuration exists. It must not be presented as real payment settlement before a transaction is verified.

## Readiness UX and current Production lock (2026-11-21)

The **Review and sign 0.1 Testnet CCD in Wallet** button now starts **disabled** and stays disabled until all three read-only public checks succeed:

- `GET /api/x402/status`: `CONFIGURED_NOT_PAYMENT_TESTED` with no missing gateway prerequisites.
- `GET /api/sponsor/status`: `CONFIGURED_UNTESTED` with no missing Sponsor prerequisites.
- `GET /api/sponsor/accounts`: both accounts on-chain, Sponsor funded, signing key independently verified against credential 0/key 0, network and Merchant matching.

The UI displays the first actionable missing prerequisite and never opens a wallet extension while locked. **Refresh status** reruns the readiness checks. An explicit checkout action still repeats the **server-side** checks independently; browser readiness is not a substitute for authorization.

At the latest observed Production check, the gateway was locked with `ENABLE_TESTNET_GATEWAY` and `HTTPS_CONCORDIUM_FACILITATOR`; the Sponsor reported `FACILITATOR_DISABLED`, `SPONSOR_KEY_SECURELY_CONFIGURED`, `SPONSOR_API_AUTH_CONFIGURED`, `GATEWAY_SAFETY_PREREQUISITES`, and `FACILITATOR_URL_NOT_FIRST_PARTY`. The on-chain Sponsor had available Testnet CCD but `SPONSOR_KEY_NOT_CONFIGURED`. **Do not enable settlement before secure signing-key custody is established.** Changes to secret env vars belong only in the owner's restricted Vercel Environment Variables settings; no key material is accepted in this application, PRs or chat.

## Browser wallet payment path (native Concordium, not x402 exact)

**Free-tier routing:** Both browser preparation and chain inspection are multiplexed through the existing `/api/x402/resource` Vercel function using the explicit `mode` query. This avoids exceeding the Hobby plan's 12-function limit. They are not extra deployed API functions.


The current Concordium Wallet for Web implements `sendSponsoredTransaction(sender, sponsorSignedTransaction)`, in which the **Sponsor signs the V1 transaction first** and then the **owner's browser wallet reviews, co-signs and submits** it. This is the officially documented wallet protocol, but is not interchangeable with the **sender-first** `@x402/concordium/exact/client` `PAYMENT-SIGNATURE` protocol used by the existing HTTP resource.

TrustGate now includes a **separate opt-in native sponsored checkout**, visibly labeled as such on `/x402-gateway`:

1. The browser first reads `/api/x402/status` and `/api/sponsor/accounts`. Any locked Gateway, missing funded Sponsor or unverified signing authority stops **before connecting a wallet**.
2. The owner wallet for Agent #1323 connects on Testnet and signs a new 90-second, merchant-bound **non-payment access intent**. This access signature never moves CCD.
3. `POST /api/x402/resource?mode=browser-prepare` verifies the signed access intent and live badge, checks Sponsor account funding and on-chain Ed25519 signing authority and verifies the owner has at least 100000 microCCD available. All first-party Sponsor and Gateway flags must be enabled.
4. A global Redis Lua quota allows **at most two preparation attempts per minute and four per UTC day**. Another atomic Redis reservation locks the specific owner-intent nonce before issuing the Sponsor-signed transaction. If preparation fails ambiguously, its reservation stays locked.
5. The server creates a *fixed* V1 `Transaction.transfer` for **100000 microCCD**, from Agent #1323 owner to the configured Merchant, with Sponsor paying network fees. Only the Sponsor portion is signed on the server. No keys appear in the response.
6. The owner independently reviews and authorizes the transaction through `provider.sendSponsoredTransaction(...)` in Concordium Wallet; the wallet submits it and returns a transaction hash. TrustGate never claims finalization solely from a browser-returned hash.
7. `GET /api/x402/resource?mode=browser-inspect&hash=<64-hex>` performs a **read-only, rate-limited** independent finalized transaction scope check (owner, recipient, amount, Sponsor and hash), even when the checkout is later locked. The result `verified=true` proves only a matching on-chain transfer, **not** that a particular prior browser session received a paid x402 resource or that the payment cannot be replayed across sessions.

**Operational blocker:** The Sponsor key is **not yet present** in Vercel Production. The browser cannot prepare a transfer until the operator privately configures a correct Sponsor Ed25519 seed and strong API bearer token in Vercel encrypted environment variables and then intentionally enables Testnet flags. Do not put those credentials in chat, a file upload, a GitHub commit or a wallet connection dialog. The Testnet-funded Sponsor public account is not equivalent to private-key custody. Avoid enabling with more CCD than necessary.

**Remaining x402 exact gap:** Native wallet-sponsored settlement is a real CCD transfer possibility but **does not** send the SDK's sender-first `PAYMENT-SIGNATURE` to `/api/x402/resource`; paid-resource delivery remains disabled until a compatible verified bridge is built. No live transfer or paid response was observed at the time of writing. The new path uses public on-chain inspection, not a completed payable access token. Never label this as fully x402-compliant.

Reference: [official Concordium browser wallet sponsored transaction guide](https://docs.concordium.com/en/mainnet/tutorials/protocol-level-sponsored-transactions/create-a-sponsored-transaction.html), and [Sponsor backend guide](https://docs.concordium.com/en/mainnet/tutorials/protocol-level-sponsored-transactions/set-up-a-sponsor-service.html).

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
| `POST /api/sponsor/settle` | 4 per minute **and max 8 per UTC day** |

A single Upstash `EVAL` performs `INCR` and sets an expiry for each global counter; settlement checks both the minute bucket and an independent UTC-day bucket atomically. Exceeded quotas return HTTP 429. Redis errors or ambiguous results return HTTP 503 and never invoke sponsor signing. Limits intentionally favor this single-owner Testnet demo, not public payment throughput. Counters contain no personal identifiers or credentials. This control does **not** replace spending caps, key custody, transaction reconciliation, or monitoring; only authorize sponsorship after all those controls are reviewed. No sponsor gas or payment is charged by this readiness work.

## Owner-wallet HTTP 402 preflight (no CCD signing)

The gateway page now has a **Check owner-signed HTTP 402** action. It is a deliberately *read-only* integration step for the current Concordium Wallet for Web, not a substitute for the `@x402/concordium/exact/client` V1 payment signer.

1. The browser checks `/api/x402/status`. If settlement is locked, the action stops **before** requesting a wallet signature.
2. When configuration is ready, the user connects the registered Agent #1323 owner wallet on Testnet and signs the canonical `trustgate-x402-intent/v1` message (exact badge, nonce, merchant, amount, chain, resource and 90-second validity).
3. The browser sends that signed intent via `X-Trustgate-Intent` to `GET /api/x402/resource`, **without** a `PAYMENT-SIGNATURE` header.
4. The backend verifies wallet signature and Agent #1323 badge, then issues official HTTP 402 and `PAYMENT-REQUIRED`. The browser independently compares fixed Testnet amount, asset, recipient, fee payer and header/body consistency.
5. The UI displays only public requirements. It does **not** retain the owner's signature or attempt an on-chain transfer.

The wallet's existing `signMessage` API is only an access-intent signature, never permission to transfer CCD. The official Concordium browser wallet documents a *sponsor-first* `sendSponsoredTransaction` flow; the `@x402/concordium/exact/client` implementation here uses a *sender-first* signed V1 payment payload for the facilitator to submit. These are **not interchangeable** without designing and testing an explicit protocol adapter. We intentionally have not added a private-key collection form, a wallet export upload or an unsupported browser payment bridge.

References: [Concordium protocol-level sponsored transaction tutorial](https://docs.concordium.com/en/mainnet/tutorials/protocol-level-sponsored-transactions/create-a-sponsored-transaction.html), [x402 Concordium mechanism source](https://github.com/x402-foundation/x402/tree/main/typescript/packages/mechanisms/concordium).

## Sponsor signing-key authority (fail-closed, Testnet only)

The first-party Concordium facilitator now checks **more than a funded Sponsor account** before it can create a fee-paying SDK signer:

- Derive the Ed25519 public key in memory from the **32-byte hex secret seed** supplied securely by Vercel environment variables. No secret is collected by the website or stored in Redis, logs or an API response.
- Read the *current* Sponsor Testnet account credentials through gRPC.
- Require `accountThreshold === 1`, credential index `0` of type `initial` or `normal`, that credential's `threshold === 1`, and Ed25519 key index `0` equal to the key derived from the configured seed. A basic single-key signer cannot satisfy higher signature thresholds.
- Reject missing/mismatched credentials, a rotated key, an unsupported signer shape, or RPC failure **before** creating the x402 fee-payer signer. Each facilitator initialization repeats the check.
- `GET /api/sponsor/accounts` reports only `signingKeyVerified` and a safe `signingKeyStatus` alongside public account/funding status. It does not reveal the seed, derived key or credential contents. Its existing global 15/minute Redis limit still applies.

The unit tests use RFC 8032's **public** Ed25519 test vector, not a TrustGate key. The deployed sponsor has not yet been provisioned with an authorized secret; this gate therefore does **not** prove an operational signing key or a successful payment. Configure secrets only using restricted Vercel project settings; do not paste private keys or seed phrases into ChatGPT or GitHub.

**Still required for a real x402 payment:** owner-controlled V1 sender transaction signing, securely authorized Sponsor funds, live use of the independent finalization checker, operational reconciliation for RPC outages, one paid API delivery, and a CCDExplorer transaction. Unit tests cannot substitute for that evidence.

## Independent public Testnet account readiness (read-only)

The gateway's **Check on-chain** action queries `GET /api/sponsor/accounts`. It checks the current Merchant and Sponsor Testnet accounts using the Concordium gRPC SDK. It does not connect a wallet, return signing credentials, or submit any transaction. A single atomic Upstash `EVAL` limits requests to **15 globally per minute**, even while settlement is disabled. When Redis is unavailable, no RPC call is attempted.

The account check distinguishes `ACCOUNTS_PRESENT_SPONSOR_HAS_CCD` from `ACCOUNTS_NOT_READY` and `ONCHAIN_LOOKUP_UNAVAILABLE`; a timeout never means an account was proved absent. A positive *available* Sponsor balance establishes only that the account holds some spendable Testnet CCD. It does **not** establish enough CCD to pay the actual transaction fee, that the private key belongs to the configured Sponsor address, or that any x402 payment succeeded.

Before building its fee-paying SDK signer, the first-party facilitator repeats this on-chain check. Missing merchant account, no spendable CCD or an RPC failure blocks signing. This is a source-level safety gate; it remains unexercised with a funded on-chain Sponsor until real credentials and funds are configured. Never enable payment flags until signing-key ownership, spending limit, client compatibility, replay/incident handling and on-chain settlement have been demonstrated.

## Important limitations and required manual tests

- The public browser page is a **readiness and quote inspector**, not a client that signs Concordium V1 sponsored transfers. A future paying client must use the official `@x402/concordium/exact/client` scheme in an owner-controlled secure wallet environment. Never enter a wallet private key on this page.
- The HTTP 402 and settlement paths have mock-backed automated tests. **No real Testnet payment has yet been made or observed in CCDExplorer**.
- A single atomic Upstash Redis Lua `EVAL` reserves the intent and payment keys together; the settlement record transition is also atomic and conditioned on both keys remaining reserved. An ambiguous settlement leaves locks in place and requires **manual transaction reconciliation**. This is deliberately fail-closed. There is no automated recovery portal yet.
- Storage must be reliable and atomic; serverless in-memory Maps are insufficient. Rate limits, monitoring and merchant reconciliation should be added before operating a public paid service.
- **New fail-closed independent finalization check:** following the facilitator's successful response, the resource server directly reads the transaction's finalized block-item summary from the Concordium Testnet node through `getBlockItemStatus`. It matches the transaction hash, the sender Agent #1323 owner account, exact merchant receiver, exact 100000 microCCD amount, and Sponsor fee payer. A pending/failed/wrong-type/unavailable response returns HTTP 503, keeps the Redis replay reservation in progress, and requires reconciliation rather than issuing paid evidence. This check is covered by mocked tests only; it has not observed any completed Testnet x402 transaction.
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
- [x] Read-only on-chain Sponsor/Merchant readiness check with Redis RPC quota and fail-closed signer preflight
- [ ] Sponsor funded with test CCD, securely installed signing key, and real `/supported` smoke test
- [x] Secure Redis credentials connected to Vercel Production (reconciliation plan still required)
- [x] Read-only browser owner-signed access intent and strict HTTP 402 challenge inspector (only usable once Sponsor is configured)
- [ ] Paying client with owner-controlled V1 sponsored transaction signing
- [ ] Actual successful Testnet transfer to merchant, on-chain transaction independently verified
- [x] Source-level independent on-chain **finalized CCD transfer** verification with fail-closed mocked tests (no live paid receipt)
- [ ] Operational monitoring and reconciliation workflow for partial or ambiguous settlement
- [ ] Accurate hackathon video showing real 402 → sponsor-settled CCD → paid resource

The current project may demonstrate the **ready-to-integrate software structure** but MUST NOT claim payment execution or full x402 completion yet.
