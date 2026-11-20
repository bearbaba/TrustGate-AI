# Concordium Testnet — Agent #1323 on-chain evidence

Date: 2026-11-20

TrustGate AI is linked to an active CIS-8004 native agent on Concordium Testnet.

## Agent identity
- Agent ID: `ccd:4221332d34e1694168c2a0c0b3fd0f27/cis-2:JyP9UhV91L3jWGjHH4aB7`
- Token ID: `1323` (CIS-2 token ID hex `2b05000000000000`)
- Owner: `34C1ozW8edKtBmA8FUFoR4aBys8ofuwtRmYqqbzNVPAsATT4wk`
- Registry contract: `<12802,0>` (`CIS-8004`) on Concordium Testnet
- Agent Card: https://trustgate-ai.vercel.app/.well-known/agent-card.json
- Agent Card SHA-256: `ed33956577d378ef0bfd537505863d846a2c130513302a2d45d99e5bfc009c44`

## Confirmed metadata update
- Transaction: https://ccdexplorer.io/testnet/transaction/93280aa5361967fc656e513e824c495c932c2abdc4cd7253bf3f2db35d90f4ee
- Transaction hash: `93280aa5361967fc656e513e824c495c932c2abdc4cd7253bf3f2db35d90f4ee`
- Event: `CIS-8004.uri_updated`
- Entrypoint: `CIS-8004.setAgentURI`
- Block height: `51,056,295`
- Transaction result reported by CCDExplorer: **Account Transaction Success**
- Cost: 14.046047 **Testnet CCD** (1,880 NRG); test currency has no redeemable market value.

The successful event includes the URI above and the SHA-256 above. This is on-chain metadata evidence, **not** proof of live payment execution or autonomous agent transaction settlement.

## Verification still required
Check the registry's badge verifier:

```sh
curl -fsS 'https://agent-registry-mcp.concordium.com/v1/check-badge/JyP9UhV91L3jWGjHH4aB7'
```

Only mark full card verification complete if the response reports `badge_valid: true`, `extension_conformant: true`, `verification_present: true` and `issues: []`. The final verification response has not been captured in this repository yet.

## Protect the card hash
The card bytes are already pinned on-chain. Editing the hosted `public/.well-known/agent-card.json` changes its SHA-256 and breaks the integrity match until another `setAgentURI` update. Keep the current file unchanged when editing README, docs, UI, and other files.

## Proof boundary
An owner-verified active agent and a finalized metadata update do **not** mean the separate policy-review frontend executes x402, transfers CCD, manages agent spending authorizations or persists audits on chain. Those features remain outside the deployed prototype.
