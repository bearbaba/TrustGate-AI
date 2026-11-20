# TrustGate AI — Roadmap (2026-11-20)

## Verified milestones
- [x] Responsive decision-review prototype
- [x] Concordium registry badge resolver adapter (fail-closed)
- [x] Deterministic policy outcomes: ALLOW / REVIEW / BLOCK
- [x] Session JSON audit export with SHA-256 integrity digests
- [x] GitHub Actions CI and Vercel deployment
- [x] Testnet wallet account and active Native agent #1323
- [x] Published Agent Card with badge extension and owner account
- [x] Owner-signed Testnet `setAgentURI` on Agent #1323 to publish Card URL and SHA-256, block 51,056,295; see ONCHAIN_EVIDENCE.md
- [x] Built owner-only guarded transaction-signing page with wallet/network/card/parameter checks

## Required verification and improvements
- [ ] Capture official `/v1/check-badge/JyP9UhV91L3jWGjHH4aB7` output; require all 3 flags true, issues empty
- [ ] Confirm metadata URI and hash also shown in the Agent Registry detail UI
- [ ] Test public Decision Lab against the *live* registered badge; distinguish resolver behavior from mocked fixture tests
- [ ] Implement concrete identity-bound service policy demo and show its actual security boundary
- [ ] Implement meaningful end-to-end x402 test payment only if safely feasible; otherwise disclose it as planned, not shipped
- [ ] Add durable, tamper-evident server-side audit and replay/idempotency safeguards if enabling real money flows
- [ ] Review frontend with screenshots/responsive checks, error handling, and deployed endpoints
- [ ] Prepare 3-minute hackathon video, proof links, public source, and go-live plan
- [ ] Complete Encode Club registration and submit before official deadline

## Scope warning
Active native badge registration and signed metadata update are real on-chain interactions. The ALLOW/REVIEW/BLOCK workflow is still a **read-only policy classification** and does not initiate payment transfers. Avoid claims of x402 or autonomous payments until actual on-chain execution and independent verification are demonstrated.

Do not modify `public/.well-known/agent-card.json` without intentionally updating the anchored SHA-256.
