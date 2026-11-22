import { PROOF_CONTEXT } from './proof-message.js';

/**
 * Avoid generating a new browser-extension CONNECT prompt when TrustGate is
 * already connected to the registered Agent #1323 owner.
 *
 * A previously connected but WRONG account is never reused or silently
 * switched. The user must select the correct account in Concordium Wallet.
 * This helper does not approve signatures or transactions.
 */
export async function connectOwnerWallet(wallet, expectedOwner=PROOF_CONTEXT.owner) {
  if(!wallet || typeof wallet.connect!=='function')throw Error('CONCORDIUM_WALLET_CONNECT_NOT_AVAILABLE');
  let account;
  let method='existing';
  if(typeof wallet.getMostRecentlySelectedAccount==='function'){
    // If this query itself fails, do NOT blindly issue another CONNECT popup.
    // A blocked extension may already be processing a request.
    account=await wallet.getMostRecentlySelectedAccount();
  }
  if(account!=null && account!==''){
    if(typeof account!=='string'||account!==expectedOwner)
      throw Error('WRONG_CONNECTED_ACCOUNT_SELECT_AGENT_1323_OWNER_IN_WALLET');
  }else {
    method='new';
    account=await wallet.connect();
  }
  if(typeof account!=='string'||account!==expectedOwner)
    throw Error('WRONG_CONNECTED_ACCOUNT_SELECT_AGENT_1323_OWNER_IN_WALLET');
  return {account,method};
}
