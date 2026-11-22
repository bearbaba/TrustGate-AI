#!/usr/bin/env node
// Concordium Testnet x402 exact payment. Runs ONLY on your local computer.
// DO NOT paste an account key into ChatGPT, GitHub, Vercel or the website.
// The key is read from the local process environment and never logged/saved.
import {createInterface} from 'node:readline/promises';
import {
  inspectExactClientReadiness,submitExactTestnetPayment
} from '../lib/x402-exact-local-client.js';

function usage(){
  console.log('TrustGate AI — official Concordium x402 exact · Testnet only');
  console.log('Usage: node scripts/x402-exact-local.mjs --check');
  console.log('       node scripts/x402-exact-local.mjs --pay');
  console.log('For --pay set TRUSTGATE_OWNER_PRIVATE_KEY in your LOCAL shell only.');
  console.log('The key must control the registered Agent #1323 Owner account.');
  console.log('Do NOT store that key in this repository or submit it to an online form.');
}

async function main(){
  const cmd=process.argv[2];
  if(!['--check','--pay'].includes(cmd)){usage();process.exitCode=2;return;}
  if(process.env.VERCEL || process.env.CI){
    throw Error('LOCAL_ONLY_SIGNER_ENVIRONMENT_REQUIRED');
  }
  if(cmd==='--check'){
    const readiness=await inspectExactClientReadiness();
    console.log(JSON.stringify(readiness,null,2));
    console.log('No wallet signature or CCD transfer was requested.');
    return;
  }
  if(!process.stdin.isTTY || !process.stdout.isTTY)
    throw Error('INTERACTIVE_TERMINAL_REQUIRED_FOR_PAYMENT');
  console.log('Only Concordium Testnet. One EXACT x402 payment costs 0.1 TEST CCD.');
  const readiness=await inspectExactClientReadiness();
  console.log('Owner: 34C1ozW8edKtBmA8FUFoR4aBys8ofuwtRmYqqbzNVPAsATT4wk');
  console.log('Merchant: '+readiness.merchant);
  console.log('Sponsor: '+readiness.sponsor+' (fees)');
  console.log('Payment: 0.1 Testnet CCD. It cannot be automatically refunded.');
  console.log('First check recent Owner and Merchant Testnet transactions for earlier attempts.');
  const rl=createInterface({input:process.stdin,output:process.stdout});
  let answer;
  try{answer=await rl.question('To authorize ONE new payment, type PAY 0.1 TESTNET CCD: ');}
  finally{rl.close();}
  if(answer!=='PAY 0.1 TESTNET CCD'){
    console.log('Cancelled. No payment created.');
    return;
  }
  const ownerPrivateKey=process.env.TRUSTGATE_OWNER_PRIVATE_KEY;
  if(!/^[a-fA-F0-9]{64}$/.test(ownerPrivateKey||''))
    throw Error('OWNER_LOCAL_SIGNER_REQUIRED: set a 32-byte Ed25519 account key in your local process environment only');
  console.log('Creating fresh signed access intent and official x402 exact sender payment...');
  const proof=await submitExactTestnetPayment({
    ownerPrivateKey,
    onStage:(stage)=>console.log(stage)
  });
  console.log(JSON.stringify(proof,null,2));
  console.log('Payment finalized. Verify the public hash independently on CCDExplorer.');
}

main().catch(error=>{
  console.error('X402 checkout not confirmed:',error?.message||'Unknown error');
  if(error?.transaction)
    console.error('Public transaction hash for reconciliation:',error.transaction);
  console.error('DO NOT retry payment without checking Testnet transaction history.');
  console.error('Owner history: https://ccdexplorer.io/testnet/account/34C1ozW8edKtBmA8FUFoR4aBys8ofuwtRmYqqbzNVPAsATT4wk');
  process.exitCode=1;
});
