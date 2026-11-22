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

export function describeWalletPromptError(error){
  const message=typeof error?.message==='string'?error.message:'';
  if(/another prompt is already open|request.*(already )?pending|already processing|prompt.*already open|already.*request.*open/i.test(message))
    return 'Concordium Wallet already has an open request. Open the wallet extension and approve or reject that existing prompt before retrying. Do not open a second payment request.';
  if(/user rejected|user denied|user cancel|rejected by user/i.test(message))
    return 'Wallet request was rejected. No new request will be opened automatically.';
  return message||'Concordium Wallet or backend error';
}
