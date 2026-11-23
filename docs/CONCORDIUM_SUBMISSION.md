# TrustGate AI — Concordium Trusted Agents Hackathon 2026 Submission Pack

**Prepared on:** 22 November 2026  
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

The x402 integration uses the official `@x402/core` and `@x402/concordium` exact packages. Production has a separate Merchant, an on-chain verified fee Sponsor and a durable Redis replay guard. A real HTTP 402 challenge with a 0.1 Testnet CCD quote and Sponsor metadata has been successfully generated after a wallet-signed access intent. A dedicated owner-local client now supports constructing the official sender-signed, Sponsor-pending V1 payment payload; on a valid paid request, the facilitator verifies the sender signature, adds its own signature, submits for finalization and independently checks the on-chain transfer before any paid resource is released.

**Verification boundary:** No finalized x402 payment or paid-resource delivery has yet been independently demonstrated. The browser wallet's separate native sponsored-checkout review reached the correct 0.1 CCD / zero-fee approval screen but encountered a signing issue; that transaction is not claimed as settled. TrustGate never treats policy ALLOW or an HTTP 402 quote as evidence of money transferred. Testnet is used deliberately to preserve safety and low cost.

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
| CCDExplorer — successful Agent Card update | https://ccdexplorer.io/testnet/transaction/93280aa5361967fc656e513e824c495c932c2abdc4cd7253bf3f2db35d90f4ee |
| Concordium Agent Card | https://trustgate-ai.vercel.app/.well-known/agent-card.json |
| Independent on-chain verification | https://github.com/bearbaba/TrustGate-AI/blob/main/docs/ONCHAIN_EVIDENCE.md |
| Owner-signature and policy evidence | https://github.com/bearbaba/TrustGate-AI/blob/main/docs/LIVE_PROOF_EVIDENCE.md |

**Payment transaction hash:** NOT AVAILABLE / NOT VERIFIED. Do not substitute the Agent Card update hash as an x402 payment hash.

**Demo video URL:** REQUIRED — not recorded or uploaded yet. Do not invent a video link.

## What demonstrably works

- Concordium Testnet CIS-8004 Agent #1323 Active, anchored Agent Card and a successful metadata update transaction
- Owner-signed Live Proof, six independent Policy Witness checks, and four observed Attack Lab cases
- Deterministic ALLOW / REVIEW / BLOCK with a reproducible policy manifest and receipt verifier
- Official x402 HTTP 402 challenge from configured Merchant and verified Sponsor, 100000 microCCD Testnet quote, on-chain Sponsor key validation and durable Redis replay reservation
- Official sender-first exact Testnet client source with offline tests and explicit human approval for a **local signer**; no automatic broadcast from the browser UI

## What is not yet demonstrated

- A successful, independently verified `FINALIZED` x402 exact payment followed by `PAID_VERIFIED_AGENT_EVIDENCE`
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
| 01:56–02:13 | x402 Testnet gateway, 402 challenge and exact fee quote | Real 402 challenge; settlement not yet claimed. |
| 02:13–02:25 | Architecture and public links | Proof before permission. Settlement before access. |

**If and only if a real finalized x402 Testnet payment is verified**, replace the final sequence with the actual payment hash, independent settlement response and paid-resource delivery. Never use an unfinalized or unrelated hash. Do not include wallets' secret screens in the recording.

## Mainnet and user-adoption plan

1. Finish one genuine Testnet sender-first x402 exact payment and public transaction reconciliation without double spending; harden cross-session replay/idempotency and recovery.
2. Add secure server-issued receipt attestations and durable audit records, apply threat modeling and smart-contract / API security review.
3. Improve owner-controlled payment signing UX without asking the user to upload a signing key; use an officially supported compatible signer before adding a browser payment workflow.
4. Pilot with paid research/evidence APIs and rate-limited agent service integrations, then pursue Mainnet readiness, independent security testing, monitoring and explicit user spending caps.
5. Keep the service fail-closed whenever identity, Sponsor authority, nonce integrity or settlement evidence is unavailable.

## Submission checklist

- [x] Public repository with reproducible tests
- [x] Deployed web product and actual Concordium Agent Card
- [x] Confirmed on-chain transaction (Agent metadata update, **not a payment**)
- [x] Identity / owner-signature / Policy Witness proof
- [x] Official x402 challenge, Sponsor and merchant ready on Testnet
- [x] Owner-local sender-first x402 exact client source and offline tests
- [ ] **One real finalized x402 payment and paid resource proof** (important for payment integration quality)
- [ ] **Record and upload a demo video of up to three minutes**
- [ ] Review this submission text and ensure all claims match current public proof
- [ ] **Log in to Encode Club and actually submit before deadline**

**Do not mark this file as “submitted” until an actual confirmation or submission ID is received from Encode Club.**
