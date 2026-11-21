import { detectConcordiumProvider } from '@concordium/browser-wallet-api-helpers';
import { AccountAddress } from '@concordium/web-sdk';
import { Transaction } from '@concordium/web-sdk/transactions';
import { PROOF_CONTEXT } from '../lib/proof-message.js';
import {
  assertWalletTestnet,createUnsignedX402Intent,buildX402SignedMessage,
  X402_SCOPE
} from '../lib/x402-client-intent.js';

const $=id=>document.getElementById(id);
const button=$('sponsoredWalletSend');
const inspectButton=$('sponsoredInspect');
const status=$('sponsoredWalletStatus');
const output=$('sponsoredWalletResult');
let submittedHash=null;

function report(message,good=false){
  status.className='status '+(good?'good':'');
  status.textContent=message;
}

function requireScope(response,account,merchant,sponsor){
  if(response?.kind!=='NATIVE_WALLET_SPONSORED_PREPARED_V1'||
    response.network!==X402_SCOPE.network||
    response.amountMicroCcd!==X402_SCOPE.amountMicroCcd||
    response.owner!==account || response.merchant!==merchant ||
    response.sponsor!==sponsor)throw Error('PREPARED_TRANSACTION_SCOPE_MISMATCH');
  const header=response.sponsoredTransaction?.header;
  const payload=response.sponsoredTransaction?.payload;
  // Independently inspect the real V1 JSON, not only top-level labels.
  // Even a malformed backend must never bring an unexpected action to
  // the wallet's confirmation screen.
  if(payload?.type!=='transfer'||
     payload.toAddress!==merchant ||
     payload.amount!==X402_SCOPE.amountMicroCcd)
    throw Error('PREPARED_TRANSACTION_TRANSFER_MISMATCH');
  if(header?.sender!==account ||
    (header?.sponsor?.address!==sponsor &&
      header?.sponsor?.account!==sponsor) ||
    response.sponsoredTransaction?.version!==1) {
    throw Error('PREPARED_TRANSACTION_HEADER_MISMATCH');
  }
  return true;
}

async function getJson(url,options={}) {
  const response=await fetch(url,{cache:'no-store',...options});
  const data=await response.json();
  if(!response.ok)throw Error(data?.error||'SERVICE_UNAVAILABLE');
  return data;
}

async function submitSponsoredWalletTransfer(){
  button.disabled=true;
  inspectButton.disabled=true;
  submittedHash=null;
  output.textContent='';
  try{
    report('Checking gateway and Sponsor signing authority before requesting a wallet signature…');
    const config=await getJson('/api/x402/status');
    if(config.status!=='CONFIGURED_NOT_PAYMENT_TESTED')
      throw Error('GATEWAY_LOCKED_NO_SIGNATURE_REQUESTED');
    const state=await getJson('/api/sponsor/accounts');
    if(state.signingKeyVerified!==true ||
       state.sponsorHasAvailableCcd!==true ||
       state.merchant!==config.merchant || !state.sponsor)
      throw Error('SPONSOR_KEY_OR_FUNDS_NOT_READY');
    const wallet=await detectConcordiumProvider(4000);
    if(typeof wallet?.sendSponsoredTransaction!=='function')
      throw Error('WALLET_REQUIRES_SEND_SPONSORED_TRANSACTION_SUPPORT');
    if(typeof wallet.signMessage!=='function')
      throw Error('WALLET_REQUIRES_SIGN_MESSAGE');
    const account=await wallet.connect();
    assertWalletTestnet(account,await wallet.getSelectedChain());
    const nonce=Array.from(crypto.getRandomValues(new Uint8Array(16)),
      b=>b.toString(16).padStart(2,'0')).join('');
    const intent=createUnsignedX402Intent(account,config.merchant,nonce,Date.now());
    report('Sign a NON-PAYMENT access intent first. The transfer requires a separate wallet approval.');
    const signature=await wallet.signMessage(account,buildX402SignedMessage(intent));
    if(!signature || typeof signature!=='object'||Array.isArray(signature))
      throw Error('INVALID_OWNER_MESSAGE_SIGNATURE');
    report('Preparing one sponsor-signed 0.1 Testnet CCD transfer (no CCD has moved yet)…');
    const response=await getJson('/api/x402/browser-prepare',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({intent:{...intent,signature}})
    });
    requireScope(response,account,config.merchant,state.sponsor);
    const tx=Transaction.signableFromJSON(response.sponsoredTransaction);
    report('Review the Concordium Wallet popup: exactly 0.1 Testnet CCD to Merchant. Decline if the details differ.');
    // The wallet itself co-signs and SUBMITS. There is no silent server-side
    // transfer and signMessage() must never be used as the payment signature.
    const result=await wallet.sendSponsoredTransaction(AccountAddress.fromBase58(account),tx);
    const hash=typeof result==='string'?result:result?.toString?.();
    if(typeof hash!=='string'||!/^[a-f0-9]{64}$/i.test(hash))
      throw Error('WALLET_TRANSACTION_HASH_NOT_RETURNED');
    submittedHash=hash;
    inspectButton.disabled=false;
    output.textContent=JSON.stringify({
      state:'SUBMITTED_NOT_FINALIZED',network:X402_SCOPE.network,
      transaction:hash,explorer:'https://ccdexplorer.io/testnet/transaction/'+hash,
      amountMicroCcd:X402_SCOPE.amountMicroCcd,
      merchant:config.merchant,sponsor:state.sponsor,
      grantsPaidResource:false
    },null,2);
    report('Wallet submitted the transaction. Check on-chain finalization before treating it as proof.',true);
  }catch(error){
    report('Sponsored wallet checkout not completed: '+(error?.message||'wallet error'));
  }finally{
    button.disabled=false;
  }
}

async function inspectSubmitted(){
  if(!submittedHash)return;
  inspectButton.disabled=true;
  try{
    report('Checking independent finalization on Concordium Testnet…');
    const proof=await getJson('/api/x402/browser-inspect?hash='+encodeURIComponent(submittedHash));
    output.textContent=JSON.stringify(proof,null,2);
    report(proof.verified?
      'Finalized 0.1 Testnet CCD transfer matches sender, Merchant and Sponsor. This is native wallet payment proof, not a completed x402 exact resource claim.':
      'Not verified: '+proof.code+'. It may still be pending, or must be reconciled.',proof.verified);
  }catch(error){report('Finalization inspection unavailable: '+(error?.message||'RPC error'));}
  finally{inspectButton.disabled=false;}
}

button?.addEventListener('click',submitSponsoredWalletTransfer);
inspectButton?.addEventListener('click',inspectSubmitted);
