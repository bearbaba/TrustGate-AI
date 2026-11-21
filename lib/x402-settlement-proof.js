import { CcdAmount, TransactionHash } from '@concordium/web-sdk';
import { ConcordiumGRPCNodeClient } from '@concordium/web-sdk/nodejs';
import { credentials } from '@grpc/grpc-js';
import { PROOF_CONTEXT } from './proof-message.js';
import { X402_TESTNET } from './x402-config.js';

const HASH=/^[a-f0-9]{64}$/i;
let readClient;

function canonicalAddress(value) {
  if (typeof value==='string') return value;
  if (value && typeof value.toString==='function') {
    const formatted=value.toString();
    return formatted==='[object Object]' ? null : formatted;
  }
  return null;
}

/**
 * Verify a final CCD transfer from the *actual Concordium Testnet node*.
 * Facilitator response fields are not proof of finalization or delivery.
 * Only the canonical finalized block-item summary can authorize paid access.
 *
 * This is intentionally strict: TrustGate pays in native CCD using the
 * exact/client Transaction.transfer builder (no memo or token updates).
 */
export function assessFinalizedCcdTransfer(status, expected) {
  if (status?.status !== 'finalized' || !status?.outcome?.summary) {
    return {ok:false,code:'ONCHAIN_SETTLEMENT_NOT_FINALIZED'};
  }
  const summary=status.outcome.summary;
  if (summary.type !== 'accountTransaction' ||
      summary.transactionType !== 'transfer') {
    return {ok:false,code:'ONCHAIN_SETTLEMENT_WRONG_TRANSACTION_TYPE'};
  }
  let actualAmount;
  try {
    actualAmount=CcdAmount.toMicroCcd(summary.transfer?.amount).toString();
  } catch {
    return {ok:false,code:'ONCHAIN_SETTLEMENT_INVALID_AMOUNT'};
  }
  const hash=summary.hash?.toString?.();
  if (!HASH.test(expected?.transaction||'') ||
      typeof hash!=='string' || hash.toLowerCase()!==expected.transaction.toLowerCase() ||
      canonicalAddress(summary.sender)!==PROOF_CONTEXT.owner ||
      canonicalAddress(summary.transfer?.to)!==expected.merchant ||
      actualAmount!==expected.amountMicroCcd ||
      canonicalAddress(summary.sponsor?.sponsor)!==expected.sponsor) {
    return {ok:false,code:'ONCHAIN_SETTLEMENT_SCOPE_MISMATCH'};
  }
  return {ok:true,code:'ONCHAIN_FINALIZED_EXACT_CCD_TRANSFER_VERIFIED'};
}

export async function verifyFinalizedConcordiumPayment(transaction,requirements,deps={}) {
  const expected={
    transaction,
    merchant:requirements?.payTo,
    amountMicroCcd:requirements?.amount,
    sponsor:requirements?.extra?.feePayer
  };
  if(!HASH.test(transaction||'') || !expected.merchant ||
     !expected.sponsor || !/^[0-9]+$/.test(expected.amountMicroCcd||'')){
    return {ok:false,code:'INVALID_ONCHAIN_PAYMENT_SCOPE'};
  }
  let response;
  try{
    const lookup=deps.lookup||(async hash=>{
      if (!readClient) readClient=new ConcordiumGRPCNodeClient(
        'grpc.testnet.concordium.com',20000,credentials.createSsl(),
        {timeout:10000}
      );
      return readClient.getBlockItemStatus(TransactionHash.fromHexString(hash));
    });
    response=await lookup(transaction,X402_TESTNET);
  }catch{
    return {ok:false,code:'ONCHAIN_SETTLEMENT_LOOKUP_UNAVAILABLE'};
  }
  return assessFinalizedCcdTransfer(response,expected);
}
