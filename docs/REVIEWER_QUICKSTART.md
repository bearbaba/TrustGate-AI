# TrustGate AI — Reviewer Quickstart (Concordium Testnet)

**For Encode Club × Concordium Trusted Agents Hackathon reviewers**  
**Evidence status:** confirmed owner/registry/policy demonstrations; **x402 settlement not yet independently verified**  
**Live URL:** https://trustgate-ai.vercel.app/  
**Repository:** https://github.com/bearbaba/TrustGate-AI  
**Submission status:** not submitted as of this document. This guide is not a payment receipt or a security audit.

## Start here: independently check what exists

| Check | Direct evidence | What it proves | What it does not prove |
|---|---|---|---|
| Active Concordium agent identity | [Agent #1323 registry/metadata evidence](ONCHAIN_EVIDENCE.md) and [anchored Agent Card](https://trustgate-ai.vercel.app/.well-known/agent-card.json) | Testnet CIS-8004 identity, Owner binding and anchored Agent Card hash | Spending permission or payment |
| Actual finalized on-chain transaction | [CCDExplorer: setAgentURI](https://ccdexplorer.io/testnet/transaction/93280aa5361967fc656e513e824c495c932c2abdc4cd7253bf3f2db35d90f4ee) | Successful **agent metadata update** on Testnet | **NOT** a CCD payment / x402 settlement |
| Owner-controlled request | [Live Proof](https://trustgate-ai.vercel.app/live-proof) and [owner-observed run log](LIVE_PROOF_EVIDENCE.md) | Scoped wallet-message signature, current active badge, policy witness | A wallet transfer, delegation or irreversible audit record |
| Independent receipt verification | [Policy Witness specification](POLICY_WITNESS.md) and [Attack Lab](https://trustgate-ai.vercel.app/security-lab) | Deterministic ALLOW/REVIEW/BLOCK, six-check v0.5 verification and three forged-case rejections **reported from owner-observed Production runs** | External audit or a server-signed historical timestamp |
| Official x402 boundary | [Gateway](https://trustgate-ai.vercel.app/x402-gateway) and [setup/security docs](X402_GATEWAY_SETUP.md) | Testnet network, fixed 100000 microCCD requirement, separate Merchant/Sponsor, HTTP 402 challenge and replay protection design | A finalized paid request, actual CCD movement, or paid resource access |

## Quick reviewer walkthrough (no secrets needed)

1. Open the [public Agent Card](https://trustgate-ai.vercel.app/.well-known/agent-card.json) and compare its on-chain SHA-256 with the [successful registry update](ONCHAIN_EVIDENCE.md). The known metadata-update transaction is **not a payment transaction**.
2. Open [Live Proof](https://trustgate-ai.vercel.app/live-proof) and [Attack Lab](https://trustgate-ai.vercel.app/security-lab) to inspect the evidence and adversarial-verification flows. **A reviewer who does not control the registered Owner wallet cannot produce a new Owner signature**; see the documented owner-confirmed runs and independently inspect the verifier source and test fixtures.
3. Open [x402 Gateway](https://trustgate-ai.vercel.app/x402-gateway). **Inspect protocol quote** is read-only; **Check owner-signed HTTP 402** requires the registered Owner wallet and signs a non-payment access intent. Neither action sends CCD.
4. For the sender-first exact scheme, examine [x402 payment source and tests](../README.md#concordium-x402-testnet--production-gateway-configured-settlement-not-yet-verified). The browser's native sponsored-transfer review is a *separate* flow and **must not be described as a successful x402 exact session**.

## Evidence vocabulary: important for a fair evaluation

- **Verified:** Agent #1323 registry metadata update, owner-observed signed read-only Live Proof, policy-witness verification and adversarial cases, supported HTTP 402 challenge, Sponsor/Merchant setup and on-chain key checks.
- **Implemented / offline-tested:** official sender-first x402 exact client; Sponsor-side validation, replay reservation and independent finalization checks.
- **NOT verified:** any finalized x402 exact transaction, x402 paid resource delivery, a working end-to-end payment through the browser wallet, Mainnet readiness, an external security audit.
- A Testnet transaction hash is evidence only for its **actual** chain action. The Agent Card hash must never be reused as a payment reference.

## Recording a professional silent demo (no voiceover, maximum three minutes)

| Segment | Capture | Suggested subtitle |
|---|---|---|
| 0:00–0:20 | Project identity and Agent #1323 badge | “Know which verified human stands behind the agent.” |
| 0:20–0:43 | Real setAgentURI transaction and pinned Agent Card | “Registry-anchored identity on Concordium Testnet.” |
| 0:43–1:22 | **Registered Owner** performs non-payment Live Proof signing | “Scoped owner consent, not spending permission.” |
| 1:22–1:55 | Validate v0.5 receipt, then Attack Lab forgery rejection | “Independent checks. Reproducible policy.” |
| 1:55–2:18 | HTTP 402 challenge and 0.1 Testnet CCD Sponsor quote | “Exact payment boundary is guarded; settlement remains unverified.” |
| 2:18–2:30 | Architecture, source and links | “Proof before permission. Settlement before access.” |

Record only verified on-screen behavior. Do not include wallet secrets, fabricated transaction receipts or pretend an HTTP 402 quote is payment. If one true sender-first x402 exact payment is independently verified **before recording**, replace the payment segment with its actual finalized transaction hash and paid-resource response.

## Submission handoff

Official deadline: **2026-12-09 23:59 UTC** (2026-12-10 06:59 ICT). The organizer requests a project description, public code repository, video **up to three minutes**, CCDExplorer link and short production plan. See [submission pack](CONCORDIUM_SUBMISSION.md).

- Project description and path-to-mainnet narrative: [CONCORDIUM_SUBMISSION.md](CONCORDIUM_SUBMISSION.md)
- Public repo: https://github.com/bearbaba/TrustGate-AI
- Working website: https://trustgate-ai.vercel.app/
- CCDExplorer (registry update only): https://ccdexplorer.io/testnet/transaction/93280aa5361967fc656e513e824c495c932c2abdc4cd7253bf3f2db35d90f4ee
- **Video URL:** pending recorded and hosted evidence.
- **Submission confirmation:** pending logged-in Encode Club submission.

## Free-tier release policy

Only merge to `main` after CI and evidence review, to trigger **one intentional Production deployment**. Vercel Preview deployments are disabled on `fix/*`, `feat/*` and `test/*` by `vercel.json`. Repeated deployments, new paid services or Blob storage are not prerequisites for producing this reviewer documentation. **Never modify the anchored Agent Card JSON without updating its on-chain hash.**
