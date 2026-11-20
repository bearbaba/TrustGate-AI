# TrustGate AI — Roadmap (2026-11-20)

## Shipped in this prototype
- [x] Responsive identity and payment-policy review UI
- [x] Fixed-origin Concordium badge resolver adapter (real endpoint; no live badge verified yet)
- [x] Fail-closed identity and deterministic ALLOW/REVIEW/BLOCK policies
- [x] JSON audit export + SHA-256 integrity checksum
- [x] Mocked tests and GitHub Actions CI

## To complete before 2026-12-09 23:59 UTC
- [ ] Register for Encode Club programme
- [ ] Create Concordium testnet wallet/identity using user's own wallet (never share seed)
- [ ] Generate valid Agent Card using build_agent_card and host exact bytes
- [ ] Use build_register, sign owner wallet transaction, verify minted badge on testnet
- [ ] Reanchor Agent Card with badge extension and verify its SHA-256 hash
- [ ] Confirm live registry response, badge status and CCDExplorer transaction hash
- [ ] Integrate a wallet-authorized x402 testnet demo (no private keys in source)
- [ ] Implement idempotency, replay prevention, identity-bound policies and durable audit storage
- [ ] Validate live deployment and end-to-end run
- [ ] Submit public repo, demo video (max 3 minutes), CCDExplorer link and go-live plan

Current app never signs or executes funds. Passing unit tests with fixtures is NOT evidence of live chain integration.
