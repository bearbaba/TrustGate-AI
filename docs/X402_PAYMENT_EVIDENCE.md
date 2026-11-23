# First official x402 exact payment — Concordium Testnet, 23 November 2026

**Status:** The registered Owner ran `npm run x402:pay` locally, explicitly confirmed one 0.1 Testnet CCD exact payment, and supplied the successful CLI response. The Production paid endpoint reported **`PAID_VERIFIED_AGENT_EVIDENCE`**, `verified:true`, and `grantsPaidResource:true`.

**Public transaction:** [`0ac313bf373f1ba409ee2ba1519be5304bf108d540d4cee6adaf3678037367de`](https://ccdexplorer.io/testnet/transaction/0ac313bf373f1ba409ee2ba1519be5304bf108d540d4cee6adaf3678037367de)

| Field | Recorded value |
|---|---|
| Chain | `ccd:4221332d34e1694168c2a0c0b3fd0f27` (Testnet) |
| Amount | 100000 microCCD = **0.1 Testnet CCD** |
| Sender / Agent #1323 Owner | `34C1ozW8edKtBmA8FUFoR4aBys8ofuwtRmYqqbzNVPAsATT4wk` |
| Merchant / recipient | `4XYepvZZJyFkKTTgoTCmNuQYar1PBiscdZBh6cRotsG2Y7SBDf` |
| Fee Sponsor | `4Q9ZNet1wKBCS3HWYxBSrHjKPfyois52h3gYUUHKe8Fw4Cf3s3` |
| Payment method | Official `@x402/concordium` **sender-first exact**, local Owner signer |
| Response | HTTP paid resource: `PAID_VERIFIED_AGENT_EVIDENCE` |
| Paid access | `grantsPaidResource:true` |

## What the Owner observed

The Owner's local CLI successfully performed:

```text
Checking live x402 exact requirements
Requesting signed-owner HTTP 402 challenge (no CCD sent)
Signing official x402 sender-only V1 payment locally (not broadcast)
Sending PAYMENT-SIGNATURE to resource; facilitator verifies, sponsors and settles
{
  "verified": true,
  "network": "ccd:4221332d34e1694168c2a0c0b3fd0f27",
  "transaction": "0ac313bf373f1ba409ee2ba1519be5304bf108d540d4cee6adaf3678037367de",
  "merchant": "4XYepvZZJyFkKTTgoTCmNuQYar1PBiscdZBh6cRotsG2Y7SBDf",
  "amountMicroCcd": "100000",
  "evidenceKind": "PAID_VERIFIED_AGENT_EVIDENCE",
  "grantsPaidResource": true
}
Payment finalized.
```

**Why this counts as a settled payment instead of merely a quote:** Production's `lib/x402-gateway.js` requires a successful facilitator settlement and then calls `verifyFinalizedConcordiumPayment` from `lib/x402-settlement-proof.js`. The latter independently requests the canonical transaction from Concordium Testnet gRPC and strictly checks **finalized status, transaction hash, transfer type, Owner sender, Merchant recipient, amount and fee Sponsor**. A failed node lookup, mismatched transfer, or failed Redis replay commit prevents issuing the paid-resource response. The Owner received that gated response.

## Public independent recheck — no wallet, no private key, no payment

```bash
npm install --no-audit --no-fund
npm run x402:verify-finalized
```

The recheck reads the above transaction on Concordium Testnet once. No payment is sent; no key or access token is needed. Reviewers can also inspect [CCDExplorer](https://ccdexplorer.io/testnet/transaction/0ac313bf373f1ba409ee2ba1519be5304bf108d540d4cee6adaf3678037367de). A temporary public RPC outage does not reverse a finalized payment; a recheck failure should be reported accurately.

## Boundaries and security

- **Confirmed by Owner and Production:** One real official x402 exact Testnet payment and paid-resource response. This is **not** the separate browser-extension native sponsored-transfer checkout, which still has a `value is not an integer` signing issue.
- No Mainnet settlement, unlimited autonomous agent spending, external security audit or general-purpose production service is claimed.
- Public `/api/x402/status` remains a **configuration** status; it does not re-read this historical payment on every GET. Do not equate a readiness status with a live settlement receipt.
- An Owner signing credential was shared outside the private signer environment. Treat it as **compromised** and rotate/revoke it using official owner-controlled wallet facilities before using the affected credential again. Never store signing keys or account exports in repository, CI, Vercel or chat.
- **Do not re-run `x402:pay` to generate video footage.** Use the existing public hash and owner-observed output.
- **Hackathon submission is NOT yet complete:** demo recording/URL and actual Encode Club submission confirmation remain pending.
