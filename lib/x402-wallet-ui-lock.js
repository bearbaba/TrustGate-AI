/**
 * Page-scoped wallet UI lock shared by separately bundled x402 browser flows.
 * Both entrypoints write the same DOM attribute, so a pending Connect/Sign
 * popup cannot be opened again from another TrustGate button on this page.
 *
 * This is UX coordination only, not wallet authorization, not a durable nonce
 * store, and it cannot inspect pending requests in other tabs or sites.
 */
const ATTR='data-trustgate-wallet-operation';
export const WALLET_OPERATION_EVENT='trustgate:wallet-operation-change';

export function getActiveWalletOperation(doc=document){
  const owner=doc?.documentElement?.getAttribute(ATTR);
  return owner==='preflight'||owner==='native-payment'?owner:null;
}

export function acquireWalletOperation(owner,doc=document){
  if(owner!=='preflight'&&owner!=='native-payment')throw Error('INVALID_WALLET_OPERATION');
  const root=doc?.documentElement;
  if(!root||getActiveWalletOperation(doc))return null;
  root.setAttribute(ATTR,owner);
  doc.dispatchEvent(new Event(WALLET_OPERATION_EVENT));
  let released=false;
  return ()=>{
    if(released)return;
    released=true;
    // Never release a lock acquired by another operation.
    if(root.getAttribute(ATTR)===owner){
      root.removeAttribute(ATTR);
      doc.dispatchEvent(new Event(WALLET_OPERATION_EVENT));
    }
  };
}

/**
 * Only stable stage/code data belongs in shareable diagnostics. Never copy a
 * wallet signature, Sponsor payload, stack or raw response into an error log.
 * A missing hash NEVER proves the transfer failed after wallet approval.
 */
export function classifyNativeWalletFailure(stage,error){
  const message=typeof error?.message==='string'?error.message:'';
  if(/value is not an integer|not a safe integer|invalid integer/i.test(message))
    return {code:'WALLET_INTEGER_SERIALIZATION_ERROR',stage,
      advice:'Wallet could not process an integer value. If you never approved Sign & Submit, use the no-approval reset. If you approved or are unsure, check wallet history before another transfer.'};
  if(/already.*prompt|request.*pending|already processing/i.test(message))
    return {code:'WALLET_PROMPT_PENDING',stage,
      advice:'Finish the wallet request already open. Never trigger a second transfer while its outcome is unclear.'};
  if(/user reject|user deny|user cancel|signing was rejected|signature was rejected/i.test(message))
    return {code:'WALLET_APPROVAL_REJECTED',stage,
      advice:'Wallet did not return a transaction hash. If this was the payment-approval stage, inspect Owner Testnet history before another payment.'};
  if(/SPONSOR_PREPARE_RATE_LIMITED|quota reached/i.test(message))
    return {code:'SPONSOR_TESTNET_PREPARE_QUOTA',stage,
      advice:'No newly prepared transaction was returned. Check the retry time in the displayed message.'};
  if(/SPONSORED_TRANSACTION_PREPARATION_FAILED|SPONSOR_PREPARE_REPLAY/i.test(message))
    return {code:'SPONSOR_PREPARATION_FAILED',stage,
      advice:'Server preparation failed or a nonce is already reserved. Never reuse the previous signed access intent.'};
  if(/onchain|RPC|TIMEOUT|NETWORK/i.test(message))
    return {code:'WALLET_OR_RPC_UNAVAILABLE',stage,
      advice:'Network or on-chain lookup unavailable. Use read-only checks first; do not assume submission failed.'};
  return {code:'WALLET_CHECKOUT_UNVERIFIED',stage,
    advice:'Payment outcome is not verified. Check any prior transaction in Owner Testnet history before another transfer.'};
}

export function describeWalletPromptError(error){
  const message=typeof error?.message==='string'?error.message:'';
  if(/another prompt is already open|request.*(already )?pending|already processing|prompt.*already open|already.*request.*open/i.test(message))
    return 'Concordium Wallet already has an open request. Open the wallet extension and approve or reject that existing prompt before retrying. Do not open a second payment request.';
  if(/signing was rejected|signature was rejected/i.test(message))
    return 'Concordium Wallet did not complete the transaction signature and returned no transaction hash. If you did NOT approve Sign & Submit, use the no-approval reset. If approval may have occurred, check Owner Testnet history before another transfer.';
  if(/user rejected|user denied|user cancel|rejected by user/i.test(message))
    return 'Wallet request was rejected. No new request will be opened automatically. If this was a payment submission, review the Owner transaction history before trying again.';
  return message||'Concordium Wallet or backend error';
}
