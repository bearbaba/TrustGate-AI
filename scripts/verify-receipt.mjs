#!/usr/bin/env node
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { inspectReceiptOffline } from '../lib/receipt-inspector.js';
import { verifyEvidenceReceipt } from '../lib/verify-receipt.js';

const HELP = `TrustGate AI — independent receipt verifier

Usage:
  node scripts/verify-receipt.mjs path/to/receipt.json --offline
  node scripts/verify-receipt.mjs path/to/receipt.json --live

--offline: No network calls. Checks checksum, signed-request field binding and
           policy witness ONLY. Does NOT authenticate any wallet signatures.
--live:    Uses the OPEN-SOURCE verifier locally; checks signature via Concordium
           Testnet RPC and current badge via the official registry (no calls to
           TrustGate's hosted API). Does NOT prove issuance time or payment.

Exit status: 0 if mode-specific checks pass; 2 if rejected; 1 on CLI/file errors.
`;
const argv=process.argv.slice(2);
if(argv.includes('--help')||argv.includes('-h')){process.stdout.write(HELP);process.exit(0);}
const paths=argv.filter(a=>!a.startsWith('--'));
const flags=argv.filter(a=>a.startsWith('--'));
if(paths.length!==1||flags.length!==1||!['--offline','--live'].includes(flags[0])) {
  process.stderr.write(HELP);process.exit(1);
}
const mode=flags[0];
try {
  const file=resolve(paths[0]);
  const info=await stat(file);
  if(!info.isFile()||info.size>25000)throw Error('Receipt must be a JSON file of at most 25 KB.');
  const content=JSON.parse(await readFile(file,'utf8'));
  const receipt=content?.receipt ?? content;
  const report=mode==='--offline'?
    inspectReceiptOffline(receipt):
    await verifyEvidenceReceipt(receipt);
  const result={
    tool:'TrustGate AI independent receipt verifier',
    mode:mode.slice(2).toUpperCase(),
    ...report
  };
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
  if(!report.ok)process.exitCode=2;
}catch(err){
  process.stderr.write('Verification could not complete: '+(err?.message||'Unknown error')+'\n');
  process.exitCode=1;
}
