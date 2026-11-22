#!/usr/bin/env node
// Concordium Testnet x402 exact payment. Runs ONLY on your local computer.
// DO NOT paste an account key into ChatGPT, GitHub, Vercel or the website.
// The key is read from the local process environment and never logged/saved.
import {createInterface} from 'node:readline/promises';
import {readFileSync,realpathSync,statSync} from 'node:fs';
import {isAbsolute,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  buildOwnerSignerFromWalletExport,inspectExactClientReadiness,submitExactTestnetPayment
} from '../lib/x402-exact-local-client.js';

function usage(){
  console.log('TrustGate AI — official Concordium x402 exact · Testnet only');
  console.log('Usage: node scripts/x402-exact-local.mjs --check');
  console.log('       node scripts/x402-exact-local.mjs --pay --wallet-file ABSOLUTE_PATH_TO_ACCOUNT_EXPORT');
  console.log('For --pay provide a LOCAL Testnet account export file OR set TRUSTGATE_OWNER_PRIVATE_KEY in your local shell.');
  console.log('Account export must remain OUTSIDE this repository and must not contain a seed phrase.');
  console.log('The key must control the registered Agent #1323 Owner account.');
  console.log('Do NOT store that key in this repository or submit it to an online form.');
}

function readLocalAccountExport(filePath) {
  let actual,root;
  try {
    actual=realpathSync(filePath);
    root=realpathSync(fileURLToPath(new URL('..',import.meta.url)));
  } catch { throw Error('LOCAL_OWNER_EXPORT_FILE_UNAVAILABLE'); }
  // Reject even symlinked exports under the Git repository: easy to commit by mistake.
  const rel=relative(root,actual);
  if(rel==='' || (!rel.startsWith('..'+sep) && rel!=='..' && !isAbsolute(rel)))
    throw Error('LOCAL_OWNER_EXPORT_MUST_BE_OUTSIDE_REPOSITORY');
  let contents;
  try {
    const stat=statSync(actual);
    if(!stat.isFile() || stat.size>131072) throw Error('bad size');
    contents=readFileSync(actual,'utf8');
  } catch { throw Error('LOCAL_OWNER_EXPORT_FILE_INVALID'); }
  return buildOwnerSignerFromWalletExport(contents);
}

async function main(){
  const cmd=process.argv[2];
  const rest=process.argv.slice(3);
  const fileArg=cmd==='--pay' && rest.length===2 && rest[0]==='--wallet-file' && rest[1]
    ?rest[1]:null;
  if(!['--check','--pay'].includes(cmd) || (rest.length!==0 && !fileArg)){
    usage();process.exitCode=2;return;
  }
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
  const ownerExportFile=fileArg||process.env.TRUSTGATE_OWNER_WALLET_EXPORT;
  if(ownerPrivateKey && ownerExportFile)
    throw Error('ONLY_ONE_LOCAL_OWNER_SIGNER_ALLOWED');
  if(!ownerPrivateKey && !ownerExportFile)
    throw Error('OWNER_LOCAL_SIGNER_REQUIRED: use --wallet-file outside the repository or set the local private key');
  if(ownerPrivateKey && !/^[a-fA-F0-9]{64}$/.test(ownerPrivateKey))
    throw Error('OWNER_LOCAL_SIGNER_REQUIRED: expected a 32-byte Ed25519 account key');
  const ownerSigner=ownerExportFile?readLocalAccountExport(ownerExportFile):undefined;
  console.log('Creating fresh signed access intent and official x402 exact sender payment...');
  const proof=await submitExactTestnetPayment({
    ownerPrivateKey,ownerSigner,
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
