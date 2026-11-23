# TrustGate AI — Concordium Trusted Agents Hackathon 2026 Submission Pack

**Updated on:** 23 November 2026  
**Submission status:** DRAFT READY FOR OWNER REVIEW — **NOT SUBMITTED**  
**Official deadline:** 9 December 2026, 23:59 UTC (10 December, 06:59 Vietnam time)  
**Organizer:** Encode Club × Concordium  
**Official information:** https://www.concordium.com/article/concordium-trusted-agents-hackathon-encode-club
**Judge-facing evidence index / silent demo plan:** [REVIEWER_QUICKSTART.md](REVIEWER_QUICKSTART.md)

## Submission fields

**Project name:** TrustGate AI  
**Tagline:** Verify the agent. Verify its owner. Enforce the payment boundary.  
**Category / focus:** Verified AI Agents, agent identity, policy enforcement, auditability and x402 exact Testnet payment integration  
**Network:** Concordium Testnet; no Mainnet transactions  
**Team:** Solo builder (confirm before submission if changed)

### Project description (ready to paste)

TrustGate AI is an identity-first security boundary for AI-agent commerce. Before an agent may request a service or act on a payment intent, TrustGate independently checks its Concordium CIS-8004 identity, verifies a narrowly scoped signature from the registered human Owner, and runs a deterministic, reproducible ALLOW / REVIEW / BLOCK policy. The result is a downloadable Policy Witness receipt that independent verifiers can recheck without trusting the hosted application.

The working agent is registered on Concordium Testnet as Agent #1323, with an Active badge, an Agent Card URI and SHA-256 anchored in registry contract <12802,0>. Its on-chain `setAgentURI` update finalized successfully. A live Owner-signed evidence request has passed all six independent verification checks, and the adversarial Attack Lab accepted an original receipt while rejecting forged policy decisions, swapped wallet signatures and substituted metadata hashes.

The x402 integration uses the official `@x402/core` and `@x402/concordium` exact packages. Production has a separate Merchant, an on-chain verified fee Sponsor and a durable Redis replay guard. A real HTTP 402 challenge with a 0.1 Testnet CCD quote and Sponsor metadata has been successfully generated after a wallet-signed access intent. A dedicated Owner-local client supports official sender-signed sponsored V1 exact payments. **One live paid request has now succeeded**: the facilitator settled 0.1 Testnet CCD, the resource backend independently checked finalization and exact transaction scope, and returned the `PAID_VERIFIED_AGENT_EVIDENCE` response.

**Payment verification update (23 November 2026):** The registered Owner completed **one real official sender-first x402 exact** payment (0.1 Testnet CCD), and Production granted `PAID_VERIFIED_AGENT_EVIDENCE` with `verified:true` and `grantsPaidResource:true`. The backend checks finalized Testnet payment sender, recipient, amount and Sponsor before granting access. [Public payment transaction](https://ccdexplorer.io/testnet/transaction/0ac313bf373f1ba409ee2ba1519be5304bf108d540d4cee6adaf3678037367de) · [Evidence / no-key verifier](X402_PAYMENT_EVIDENCE.md). The **separate** native browser-wallet checkout still has a signing error and is not claimed working. No Mainnet payment or unrestricted agent spending is claimed.

### Problem and differentiation

Agents need permission to work, but they must not treat an arbitrary prompt, a forged receipt, a wallet address, or an LLM verdict as financial authority. TrustGate separates the accountable owner, the active registered agent, reproducible deterministic policy and actual settlement into independently verifiable layers. It demonstrates real wallet-ownership and on-chain registry checks, not only a simulated agent identity or a thin LLM wrapper.

## Public links for the submission

| Field | Link |
|---|---|
| Live product | https://trustgate-ai.vercel.app/ |
| Signed public evidence | https://trustgate-ai.vercel.app/live-proof |
| Adversarial verifier | https://trustgate-ai.vercel.app/security-lab |
| x402 exact Testnet gateway | https://trustgate-ai.vercel.app/x402-gateway |
| Open-source repository | https://github.com/bearbaba/TrustGate-AI |
| **CCDExplorer — real x402 exact Testnet payment** | https://ccdexplorer.io/testnet/transaction/0ac313bf373f1ba409ee2ba1519be5304bf108d540d4cee6adaf3678037367de |
| **Paid-response evidence and independent verifier** | https://github.com/bearbaba/TrustGate-AI/blob/main/docs/X402_PAYMENT_EVIDENCE.md |
| CCDExplorer — successful Agent Card update | https://ccdexplorer.io/testnet/transaction/93280aa5361967fc656e513e824c495c932c2abdc4cd7253bf3f2db35d90f4ee |
| Concordium Agent Card | https://trustgate-ai.vercel.app/.well-known/agent-card.json |
| Independent on-chain verification | https://github.com/bearbaba/TrustGate-AI/blob/main/docs/ONCHAIN_EVIDENCE.md |
| Owner-signature and policy evidence | https://github.com/bearbaba/TrustGate-AI/blob/main/docs/LIVE_PROOF_EVIDENCE.md |

**Real exact x402 payment transaction hash:** `0ac313bf373f1ba409ee2ba1519be5304bf108d540d4cee6adaf3678037367de` ([CCDExplorer](https://ccdexplorer.io/testnet/transaction/0ac313bf373f1ba409ee2ba1519be5304bf108d540d4cee6adaf3678037367de)). It is distinct from the earlier Agent Card metadata-update transaction.

**Demo video URL:** REQUIRED — not recorded or uploaded yet. Do not invent a video link.

## What demonstrably works

**NEW — first real x402 exact settled transfer:** [Transaction 0ac313bf373f1ba409ee2ba1519be5304bf108d540d4cee6adaf3678037367de](https://ccdexplorer.io/testnet/transaction/0ac313bf373f1ba409ee2ba1519be5304bf108d540d4cee6adaf3678037367de), [paid-response evidence](X402_PAYMENT_EVIDENCE.md), and the no-secret recheck command `npm run x402:verify-finalized`.

- Concordium Testnet CIS-8004 Agent #1323 Active, anchored Agent Card and a successful metadata update transaction
- Owner-signed Live Proof, six independent Policy Witness checks, and four observed Attack Lab cases
- Deterministic ALLOW / REVIEW / BLOCK with a reproducible policy manifest and receipt verifier
- Official x402 HTTP 402 challenge from configured Merchant and verified Sponsor, 100000 microCCD Testnet quote, on-chain Sponsor key validation and durable Redis replay reservation
- Official sender-first exact Testnet client source with offline tests and explicit human approval for a **local signer**; no automatic broadcast from the browser UI

## What is not yet demonstrated

- A successful native browser-wallet sponsored transfer (not needed for the demonstrated official x402 exact paid session)
- x402 exact sender-only signing through Concordium Wallet for Web, whose exposed API signs-and-submits native sponsored transfers rather than returning a sender-only transaction signature
- Resolution of the native browser-wallet `Value is not an integer` approval error in the user's installation
- Mainnet settlement, public server-signed historical receipt issuance, or fully delegated autonomous fund access

## Suggested silent demo video (2:25, 1080p, no voiceover)

This is a **shooting plan, not a completed video**. Show only actions that actually succeed on the live website.

| Time | Recording | Subtitle |
|---|---|---|
| 00:00–00:12 | TrustGate AI Decision Lab title and the problem | Agents must prove who stands behind them. |
| 00:12–00:29 | Agent #1323 badge + anchored Agent Card | Real Concordium Testnet agent identity. |
| 00:29–00:43 | CCDExplorer successful setAgentURI transaction | Card URI and hash recorded on-chain. |
| 00:43–01:12 | Live Proof: Owner signs non-payment request | Human-owned signature, narrow access scope. |
| 01:12–01:34 | Verify Receipt result / six green checks | Independent identity and policy verification. |
| 01:34–01:56 | Attack Lab: forged policy/signature/card rejected | Tampering fails at the correct layer. |
| 01:56–02:13 | Actual exact x402 paid response and public CCDExplorer transaction | 0.1 Testnet CCD settled; resource released after finalization. |
| 02:13–02:25 | Architecture and public links | Proof before permission. Settlement before access. |

Use the already completed payment hash and documented successful paid-resource response; do NOT send a second CCD payment for the video. Never show the secret-input prompt, signing key or export in the recording.

## Mainnet and user-adoption plan

1. **Achieved:** one real sender-first exact x402 Testnet payment, independently gated by finalization and paid-resource delivery. **Next:** harden cross-session replay/idempotency and recovery before a commercial rollout.
2. Add secure server-issued receipt attestations and durable audit records, apply threat modeling and smart-contract / API security review.
3. Improve owner-controlled payment signing UX without asking the user to upload a signing key; use an officially supported compatible signer before adding a browser payment workflow.
4. Pilot with paid research/evidence APIs and rate-limited agent service integrations, then pursue Mainnet readiness, independent security testing, monitoring and explicit user spending caps.
5. Keep the service fail-closed whenever identity, Sponsor authority, nonce integrity or settlement evidence is unavailable.

## Reproducible judge checks

Run `npm run submission:check` from the public repo to validate the production Agent Card's pinned SHA-256, agent identity, fixed 0.1 CCD Testnet quote, Gateway and Sponsor scope using **four public read-only requests**. This is a configuration preflight, **not** a verified payment or settlement. Do not run it on a timer or misrepresent it as a paid proof. See [REVIEWER_QUICKSTART.md](REVIEWER_QUICKSTART.md).

## Submission checklist

- [x] Public repository with reproducible tests
- [x] Deployed web product and actual Concordium Agent Card
- [x] Confirmed on-chain transaction (Agent metadata update, **not a payment**)
- [x] Identity / owner-signature / Policy Witness proof
- [x] Official x402 challenge, Sponsor and merchant ready on Testnet
- [x] Owner-local sender-first x402 exact client source and offline tests
- [x] **One real finalized exact x402 Testnet payment and paid-resource response** — verified public hash and evidence document
- [ ] **Record and upload a demo video of up to three minutes**
- [ ] Review this submission text and ensure all claims match current public proof
- [ ] **Log in to Encode Club and actually submit before deadline**

**Do not mark this file as “submitted” until an actual confirmation or submission ID is received from Encode Club.**
