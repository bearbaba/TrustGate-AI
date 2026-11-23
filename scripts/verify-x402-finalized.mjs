#!/usr/bin/env node
// A single public read-only verification of an existing Concordium Testnet
// x402 exact transaction. NEVER signs, broadcasts, loads keys or spends CCD.
import {verifyFinalizedConcordiumPayment} from '../lib/x402-settlement-proof.js';

const transaction='0ac313bf373f1ba409ee2ba1519be5304bf108d540d4cee6adaf3678037367de';
const merchant='4XYepvZZJyFkKTTgoTCmNuQYar1PBiscdZBh6cRotsG2Y7SBDf';
const sponsor='4Q9ZNet1wKBCS3HWYxBSrHjKPfyois52h3gYUUHKe8Fw4Cf3s3';
try {
  const proof=await verifyFinalizedConcordiumPayment(transaction,{
    payTo:merchant,amount:'100000',extra:{feePayer:sponsor}
  });
  console.log(JSON.stringify({
    kind:'TRUSTGATE_PUBLIC_EXACT_TESTNET_RECHECK',
    transaction,
    network:'Concordium Testnet',
    verified:proof.ok===true,
    code:proof.code,
    merchant,sponsor,amountMicroCcd:'100000',
    requiresWallet:false,
    requestsPayment:false
  },null,2));
  if(proof.ok!==true)process.exitCode=1;
} catch {
  console.error('PUBLIC_TESTNET_RECHECK_UNAVAILABLE; no payment was attempted.');
  process.exitCode=1;
}
