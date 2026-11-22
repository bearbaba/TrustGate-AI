import { detectConcordiumProvider } from '@concordium/browser-wallet-api-helpers';
import { AccountAddress } from '@concordium/web-sdk';
import { Transaction } from '@concordium/web-sdk/transactions';
import { PROOF_CONTEXT } from '../lib/proof-message.js';
import {connectOwnerWallet} from '../lib/x402-wallet-account.js';
import {
  acquireWalletOperation,getActiveWalletOperation,describeWalletPromptError,WALLET_OPERATION_EVENT
} from '../lib/x402-wallet-ui-lock.js';
import {evaluateWalletSponsorReadiness} from '../lib/x402-wallet-readiness.js';
import {
  LAST_NATIVE_TX_KEY,normalizeNativeTransactionHash,shouldHoldNativeCheckout,
  buildNativeInspectionRecord
} from '../lib/x402-wallet-recovery.js';
import {
  assertWalletTestnet,createUnsignedX402Intent,buildX402SignedMessage,
  X402_SCOPE
} from '../lib/x402-client-intent.js';

const $=id=>document.getElementById(id);
const button=$('sponsoredWalletSend');
const inspectButton=$('sponsoredInspect');
const status=$('sponsoredWalletStatus');
const output=$('sponsoredWalletResult');
const hashField=$('sponsoredHash');
const forgetButton=$('sponsoredForget');
const downloadButton=$('sponsoredDownload');
let submittedHash=null;
let submittedVerified=false;
let inspectionInProgress=false;
let lastInspection=null;
let checkoutReady=false;
let readinessSerial=0;
let signingInProgress=false;

function report(message,good=false){
  status.className='status '+(good?'good':'');
  status.textContent=message;
}

function refreshRecoveryButtons(){
  inspectButton.disabled=inspectionInProgress ||
    normalizeNativeTransactionHash(hashField?.value)===null;
  forgetButton.disabled=!submittedHash;
  downloadButton.disabled=!lastInspection ||
    normalizeNativeTransactionHash(hashField?.value)!==lastInspection.transaction;
}

function refreshCheckoutButton(){
  const unresolved=shouldHoldNativeCheckout(submittedHash,submittedVerified);
  button.disabled=!checkoutReady || unresolved || signingInProgress ||
    !!getActiveWalletOperation();
  button.textContent=!checkoutReady?
    'Checkout locked · Sponsor setup required':
    unresolved?'Verify previous transfer before another payment':
      'Review and sign 0.1 Testnet CCD in Wallet ↗';
}

function keepPublicTransactionHash(hash){
  const normalized=normalizeNativeTransactionHash(hash);
  if(!normalized)return;
  submittedHash=normalized;
  submittedVerified=false;
  lastInspection=null;
  hashField.value=normalized;
  try{sessionStorage.setItem(LAST_NATIVE_TX_KEY,normalized);}catch{}
  refreshRecoveryButtons();
  refreshCheckoutButton();
}

function restorePublicTransactionHash(){
  let previous;
  try{previous=sessionStorage.getItem(LAST_NATIVE_TX_KEY);}catch{}
  const normalized=normalizeNativeTransactionHash(previous);
  if(normalized){
    submittedHash=normalized;
    submittedVerified=false;
    hashField.value=normalized;
  }
  refreshRecoveryButtons();
  refreshCheckoutButton();
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

async function refreshWalletReadiness(){
  if(signingInProgress)return;
  const serial=++readinessSerial;
  checkoutReady=false;
  button.disabled=true;
  button.textContent='Checking payment prerequisites…';
  report('Checking Gateway and Sponsor readiness without connecting a wallet…');
  try{
    const [gateway,sponsor]=await Promise.all([
      getJson('/api/x402/status'),getJson('/api/sponsor/status')
    ]);
    let readiness=evaluateWalletSponsorReadiness(gateway,sponsor);
    if(readiness.needsAccounts){
      // Avoid costly public gRPC calls unless server flags are configured.
      const accounts=await getJson('/api/sponsor/accounts');
      readiness=evaluateWalletSponsorReadiness(gateway,sponsor,accounts);
    }
    if(serial!==readinessSerial)return;
    checkoutReady=readiness.ready;
    refreshCheckoutButton();
    report(shouldHoldNativeCheckout(submittedHash,submittedVerified) && checkoutReady?
      'A transaction was already submitted in this tab. Verify it before starting another payment; a repeated transfer may move more CCD.':
      readiness.message,checkoutReady && !shouldHoldNativeCheckout(submittedHash,submittedVerified));
  }catch{
    if(serial!==readinessSerial)return;
    checkoutReady=false;
    button.disabled=true;
    button.textContent='Checkout locked · Readiness unavailable';
    report('Could not verify payment prerequisites. Checkout remains disabled; no wallet popup will be requested.');
  }
}

async function submitSponsoredWalletTransfer(){
  // The UI is a convenience guard; the backend independently validates
  // every prerequisite before any Sponsor signature can be generated.
  if(!checkoutReady){
    report('Checkout is locked: complete secure Sponsor setup and refresh readiness first.');
    return;
  }
  if(shouldHoldNativeCheckout(submittedHash,submittedVerified)){
    report('A previous transfer is still unverified. Check its transaction hash or explicitly clear your local record. Clearing does not cancel a blockchain transfer.');
    return;
  }
  const release=acquireWalletOperation('native-payment');
  if(!release){
    report('Another TrustGate wallet request is active. Finish or reject it before signing a transfer.');
    return;
  }
  signingInProgress=true;
  let stage='payment readiness';
  let walletSubmissionAttempted=false;
  button.disabled=true;
  inspectButton.disabled=true;
  lastInspection=null;
  downloadButton.disabled=true;
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
    stage='wallet owner connection';
    const wallet=await detectConcordiumProvider(4000);
    if(typeof wallet?.sendSponsoredTransaction!=='function')
      throw Error('WALLET_REQUIRES_SEND_SPONSORED_TRANSACTION_SUPPORT');
    if(typeof wallet.signMessage!=='function')
      throw Error('WALLET_REQUIRES_SIGN_MESSAGE');
    const {account}=await connectOwnerWallet(wallet);
    assertWalletTestnet(account,await wallet.getSelectedChain());
    const nonce=Array.from(crypto.getRandomValues(new Uint8Array(16)),
      b=>b.toString(16).padStart(2,'0')).join('');
    const intent=createUnsignedX402Intent(account,config.merchant,nonce,Date.now());
    report('Sign a NON-PAYMENT access intent first. The transfer requires a separate wallet approval.');
    stage='non-payment message signature';
    const signature=await wallet.signMessage(account,buildX402SignedMessage(intent));
    if(!signature || typeof signature!=='object'||Array.isArray(signature))
      throw Error('INVALID_OWNER_MESSAGE_SIGNATURE');
    report('Preparing one sponsor-signed 0.1 Testnet CCD transfer (no CCD has moved yet)…');
    stage='sponsor transaction preparation';
    const response=await getJson('/api/x402/resource?mode=browser-prepare',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({intent:{...intent,signature}})
    });
    requireScope(response,account,config.merchant,state.sponsor);
    const tx=Transaction.signableFromJSON(response.sponsoredTransaction);
    report('Review the Concordium Wallet popup: exactly 0.1 Testnet CCD to Merchant. Decline if the details differ.');
    // The wallet itself co-signs and SUBMITS. There is no silent server-side
    // transfer and signMessage() must never be used as the payment signature.
    stage='wallet transaction approval/submission';
    walletSubmissionAttempted=true;
    const result=await wallet.sendSponsoredTransaction(AccountAddress.fromBase58(account),tx);
    const hash=typeof result==='string'?result:result?.toString?.();
    if(typeof hash!=='string'||!/^[a-f0-9]{64}$/i.test(hash))
      throw Error('WALLET_TRANSACTION_HASH_NOT_RETURNED');
    keepPublicTransactionHash(hash);
    output.textContent=JSON.stringify({
      state:'SUBMITTED_NOT_FINALIZED',network:X402_SCOPE.network,
      transaction:hash,explorer:'https://ccdexplorer.io/testnet/transaction/'+hash,
      amountMicroCcd:X402_SCOPE.amountMicroCcd,
      merchant:config.merchant,sponsor:state.sponsor,
      grantsPaidResource:false
    },null,2);
    report('Wallet submitted the transaction. Check on-chain finalization before treating it as proof.',true);
  }catch(error){
    const unresolvedSubmission=walletSubmissionAttempted &&
      ' If you approved a transfer, inspect your wallet activity or CCDExplorer before trying again; a missing hash is not evidence of a failed payment.';
    report('Sponsored wallet checkout not completed ('+stage+'): '+describeWalletPromptError(error)+
      (unresolvedSubmission||''));
  }finally{
    signingInProgress=false;
    release();
    refreshCheckoutButton();
    refreshRecoveryButtons();
  }
}

async function inspectSubmitted(){
  const hash=normalizeNativeTransactionHash(hashField?.value);
  if(!hash){
    report('Enter a valid 64-character Concordium Testnet transaction hash to verify it.');
    return;
  }
  inspectionInProgress=true;
  lastInspection=null;
  refreshRecoveryButtons();
  try{
    report('Checking public transaction '+hash.slice(0,10)+'… against Concordium Testnet. No wallet signature required.');
    const proof=await getJson('/api/x402/resource?mode=browser-inspect&hash='+encodeURIComponent(hash));
    if(normalizeNativeTransactionHash(proof.transaction)!==hash)
      throw Error('INSPECTION_HASH_MISMATCH');
    const inspection=buildNativeInspectionRecord(proof,new Date().toISOString());
    lastInspection=inspection.verified?inspection:null;
    output.textContent=JSON.stringify(inspection,null,2);
    if(submittedHash===hash && inspection.verified)submittedVerified=true;
    refreshCheckoutButton();
    report(inspection.verified?
      'Finalized CCD transfer matches owner, Merchant, Sponsor and amount on-chain. This is NOT proof of a paid x402 session.':
      'Not yet verified ('+inspection.code+'). Do not assume funds failed to move or sign again; check the transaction in an explorer.',inspection.verified);
  }catch(error){
    report('Finalization inspection unavailable: '+(error?.message||'RPC error')+'. Do not resubmit a payment without reconciliation.');
  }finally{
    inspectionInProgress=false;
    refreshRecoveryButtons();
  }
}

button?.addEventListener('click',submitSponsoredWalletTransfer);
inspectButton?.addEventListener('click',inspectSubmitted);
hashField?.addEventListener('input',()=>{
  if(lastInspection?.transaction!==normalizeNativeTransactionHash(hashField.value))
    lastInspection=null;
  refreshRecoveryButtons();
});
downloadButton?.addEventListener('click',()=>{
  if(!lastInspection || lastInspection.verified!==true ||
      normalizeNativeTransactionHash(hashField.value)!==lastInspection.transaction)return;
  // A browser-captured verification snapshot, NOT an issuer attestation.
  const blob=new Blob([JSON.stringify(lastInspection,null,2)+'\n'],{
    type:'application/json'
  });
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');
  link.href=url;
  link.download='trustgate-native-chain-inspection-'+lastInspection.transaction.slice(0,12)+'.json';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
});
forgetButton?.addEventListener('click',()=>{
  if(!submittedHash)return;
  // Explicitly warn that forgetting a browser hash does NOT undo a transfer.
  if(!window.confirm('This only clears the public hash saved in this tab. It does NOT cancel, refund or invalidate an on-chain transaction. Have you checked its status in CCDExplorer?'))return;
  try{sessionStorage.removeItem(LAST_NATIVE_TX_KEY);}catch{}
  submittedHash=null;
  submittedVerified=false;
  lastInspection=null;
  hashField.value='';
  refreshRecoveryButtons();
  refreshCheckoutButton();
  report('Local transaction hash cleared. This does not reverse a transfer or prove it failed.');
});
restorePublicTransactionHash();

// The Gateway refresh button also rechecks Sponsor readiness. The existing
// Gateway script dispatches this after its public status request resolves.
document.addEventListener('trustgate:gateway-status-refreshed',refreshWalletReadiness);
document.addEventListener(WALLET_OPERATION_EVENT,refreshCheckoutButton);
document.addEventListener('DOMContentLoaded',()=>{
  if(readinessSerial===0)refreshWalletReadiness();
});
