import { detectConcordiumProvider } from '@concordium/browser-wallet-api-helpers';
import { PROOF_CONTEXT } from '../lib/proof-message.js';
import {connectOwnerWallet} from '../lib/x402-wallet-account.js';
import {
  acquireWalletOperation,getActiveWalletOperation,describeWalletPromptError,WALLET_OPERATION_EVENT
} from '../lib/x402-wallet-ui-lock.js';
import {
  createUnsignedX402Intent, buildX402SignedMessage,
  assertWalletTestnet, checkX402Challenge
} from '../lib/x402-client-intent.js';

const button=document.getElementById('inspectChallenge');
const status=document.getElementById('challengeStatus');
const output=document.getElementById('challengeResult');

function report(message,good=false){
  status.textContent=message;
  status.className='status '+(good?'good':'');
}

function encodeHeader(value){
  const text=JSON.stringify(value);
  if(text.length>8500)throw Error('Signed intent is unexpectedly large.');
  // The scoped message and wallet signature are ASCII-only JSON.
  if(/[^\x00-\x7f]/.test(text))throw Error('Unsupported signature encoding.');
  return btoa(text);
}

async function inspectChallenge(){
  let stage='wallet preflight';
  const release=acquireWalletOperation('preflight');
  if(!release){
    report('Another TrustGate wallet request is active. Complete or reject it before opening the HTTP 402 preflight.');
    return;
  }
  button.disabled=true;
  output.textContent='';
  try{
    report('Checking the live Testnet gateway…');
    const response=await fetch('/api/x402/status',{cache:'no-store'});
    if(!response.ok)throw Error('Gateway status is unavailable.');
    const config=await response.json();
    if(config.status!=='CONFIGURED_NOT_PAYMENT_TESTED'){
      report('LOCKED — sponsor is not yet configured. No wallet signature was requested.');
      return;
    }
    if(typeof config.merchant!=='string' || !config.merchant){
      throw Error('Merchant is not configured.');
    }
    report('Using an existing Agent #1323 owner connection, or requesting connection if needed…');
    stage='wallet owner connection';
    const wallet=await detectConcordiumProvider(4000);
    if(typeof wallet?.signMessage!=='function')throw Error('Wallet cannot sign the scoped message.');
    const {account}=await connectOwnerWallet(wallet);
    assertWalletTestnet(account,await wallet.getSelectedChain());
    const nonce=Array.from(crypto.getRandomValues(new Uint8Array(16)),
      b=>b.toString(16).padStart(2,'0')).join('');
    const intent=createUnsignedX402Intent(account,config.merchant,nonce,Date.now());
    report('Review the request in Concordium Wallet. This is NOT a transfer signature.');
    stage='non-payment message signature';
    const signature=await wallet.signMessage(account,buildX402SignedMessage(intent));
    if(!signature || typeof signature!=='object' || Array.isArray(signature)){
      throw Error('Wallet returned an invalid message signature.');
    }
    report('Verifying owner signature and live Agent #1323 badge on the backend…');
    stage='HTTP 402 challenge verification';
    // Intentionally omit PAYMENT-SIGNATURE. This can never settle a payment.
    const challenge=await fetch('/api/x402/resource',{
      method:'GET',headers:{'X-Trustgate-Intent':encodeHeader({...intent,signature})},
      cache:'no-store'
    });
    if(challenge.status!==402){
      throw Error('A valid x402 challenge was not issued (HTTP '+challenge.status+').');
    }
    const body=await challenge.json();
    if(!checkX402Challenge(body,config.merchant)){
      throw Error('The challenge does not match the fixed Testnet payment scope.');
    }
    const encoded=challenge.headers.get('PAYMENT-REQUIRED');
    if(typeof encoded!=='string' || !encoded.length){
      throw Error('Official PAYMENT-REQUIRED header was not supplied.');
    }
    const header=JSON.parse(atob(encoded));
    if(!checkX402Challenge(header,config.merchant) ||
        JSON.stringify(header.accepts)!==JSON.stringify(body.accepts)){
      throw Error('Payment requirements header and response do not match.');
    }
    output.textContent=JSON.stringify({
      status:'VALID_OFFICIAL_402_CHALLENGE',
      network:body.accepts[0].network,
      scheme:body.accepts[0].scheme,
      asset:body.accepts[0].asset,
      amountMicroCcd:body.accepts[0].amount,
      merchant:body.accepts[0].payTo,
      sponsor:body.accepts[0].extra.feePayer,
      transfersSigned:0,
      onChainPayments:0
    },null,2);
    report('HTTP 402 verified. You signed an access request, not a transaction. No CCD moved.',true);
  }catch(error){
    report('Challenge not verified ('+stage+'): '+describeWalletPromptError(error));
  }finally{
    release();
    button.disabled=!!getActiveWalletOperation();
  }
}
button.addEventListener('click',inspectChallenge);
document.addEventListener(WALLET_OPERATION_EVENT,()=>{
  button.disabled=!!getActiveWalletOperation();
});
