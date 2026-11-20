# TrustGate AI — silent demo storyboard (90–110 seconds)

> Use smooth, continuous screen recordings, large English captions, and **no voiceover**. Show only behavior verified in the actual app. The Testnet badge and transaction proof are real; no payments or x402 settlements have been implemented.

| Time | On-screen recording | Large caption |
|---|---|---|
| 00:00–00:08 | TrustGate AI main hero and concise platform overview | **AI agents should prove identity before access.** |
| 00:08–00:20 | Agent #1323 in Concordium Registry, open hosted Agent Card | **A real CIS-8004 Native Agent on Concordium Testnet.** |
| 00:20–00:29 | CCDExplorer metadata update success (block 51,056,295) | **Card URI and SHA-256 pinned on-chain.** |
| 00:29–00:39 | Open Live Proof, owner wallet, choose $1.00 | **A scoped request. No private keys. No payment.** |
| 00:39–00:52 | Show Concordium Wallet's message signature confirmation | **Owner signs a read-only challenge — gasless.** |
| 00:52–01:05 | Live Proof 4 checkpoints + ALLOW result | **Signature verified. Agent verified. Policy passed.** |
| 01:05–01:18 | Download receipt, expand Verify Receipt, upload it | **Re-check the wallet signature and live registry.** |
| 01:18–01:26 | Display all five receipt checks true | **Cryptographically checkable public evidence.** |
| 01:26–01:40 | (Once user has validated them) show $6 REVIEW and $12 BLOCK | **A valid agent still faces spending policy controls.** |
| 01:40–01:50 | End card: repository, website, on-chain proof link | **TrustGate AI · Verify before you authorize.** |

## Recording guardrails

- Record 1080p at a consistent frame rate; crop to the actual web content and wallet popup. Avoid jump cuts, tiny inset windows and choppy animations.
- Keep subtitles readable, preferably at most eight words per frame; use smooth crossfades only between completed steps.
- Clearly label all monetary amounts as **hypothetical policy inputs**.
- Exclude seed phrases, wallet export screens, credentials and browser extensions that show unrelated private data.
- The REVIEW/BLOCK scenes are **planned**, not proven by the owner yet; record them only after testing their actual Production behavior.
- A receipt's SHA-256 checksum and owner signature do not independently prove when the server issued it. Never claim server attestation, historical immutability, actual paid x402 execution, or replay prevention.
- Do not edit `public/.well-known/agent-card.json` just to add demo information; its current bytes are anchored on-chain.

## Proof links to display in the closing frame

- Live demo: https://trustgate-ai.vercel.app/live-proof
- Source: https://github.com/bearbaba/TrustGate-AI
- Contract transaction: https://ccdexplorer.io/testnet/transaction/93280aa5361967fc656e513e824c495c932c2abdc4cd7253bf3f2db35d90f4ee
- On-chain evidence: https://github.com/bearbaba/TrustGate-AI/blob/main/docs/ONCHAIN_EVIDENCE.md
