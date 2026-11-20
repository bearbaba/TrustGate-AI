# Verify a TrustGate receipt outside the TrustGate website

TrustGate AI **v0.6 independent verification tool** lets a reviewer check downloaded receipts using open-source Node.js code from GitHub. The verifier does not call `trustgate-ai.vercel.app`, and it does not need the owner's wallet, recovery phrase, API key or private signing keys.

## How to run (Windows Git Bash)

1. Export a new v0.5 Policy Witness receipt from [Live Proof](https://trustgate-ai.vercel.app/live-proof) (choose hypothetical `$1.00 — ALLOW`; sign the gasless message).
2. Install Node.js 22, open Git Bash and run:

```bash
git clone https://github.com/bearbaba/TrustGate-AI.git
cd TrustGate-AI
npm install --no-audit --no-fund
node scripts/verify-receipt.mjs "/c/Users/YourName/Downloads/trustgate-live-proof-EXAMPLE.json" --offline
node scripts/verify-receipt.mjs "/c/Users/YourName/Downloads/trustgate-live-proof-EXAMPLE.json" --live
```

Replace the filename with the actual file from your Downloads folder.

### Offline mode — fast reproducible checks

- Recomputes the canonical SHA-256
- Validates that receipt fields match the purported owner-signed intent
- Re-executes the exact current deterministic ALLOW policy and compares the Policy Witness
- **Does not authenticate the owner signature or check blockchain state**
- A malicious actor with a copy of a signed intent could fabricate other unanchored fields and recompute the checksum. This mode is only a structural check.

Success result: `OFFLINE_STRUCTURE_CONSISTENT_NOT_AUTHENTICATED`. **Do not use it to grant privileged access.**

### Live mode — independent current-chain verification

- Repeats checksum and signed-intent validation
- Verifies the owner's signature against Concordium Testnet account credentials via `grpc.testnet.concordium.com:20000`
- Fetches the current CIS-8004 badge directly from `https://agent-registry-mcp.concordium.com`
- Compares Agent #1323 owner, status, token ID, Agent Card URL and on-chain card hash

Success result: `SIGNED_REQUEST_POLICY_AND_BADGE_VERIFIED`. You can contrast this with the browser/API result; both should agree if the registry state has not changed.

The verifier requires outgoing gRPC/HTTPS network access in live mode. If the official services are down or filtered by your network, the live result must fail closed or report a connection error. Never replace an unavailable live result with an assumed pass.

## Threat-model caveat: who issued the receipt?

Even live verification **does not independently prove that TrustGate's server created the JSON**, since the current receipt is not signed by a server-held private key. It checks that the requesting owner signed the scoped intent and the current badge matches. No immutable issuance timestamp is attested and durable replay prevention is not implemented.

A **server-signed attestation** and **atomic server-side nonce store** are explicit future requirements before private data or paid actions can be authorized. These require correctly configured secrets and durable storage; never commit keys to GitHub or infer security from ephemeral serverless memory.

These checks are appropriate for the existing **public, read-only proof** demo only.

## Automated tests

```bash
npm test
npm run check
```

The test suite includes malicious edits that recompute the SHA-256, and explicitly distinguishes offline structural checks from live cryptographic verification.

## Proof references

- [On-chain Agent #1323 evidence](ONCHAIN_EVIDENCE.md)
- [Production Live Proof tests](LIVE_PROOF_EVIDENCE.md)
- [Policy Witness design](POLICY_WITNESS.md)
- [Official CCDExplorer metadata transaction](https://ccdexplorer.io/testnet/transaction/93280aa5361967fc656e513e824c495c932c2abdc4cd7253bf3f2db35d90f4ee)
