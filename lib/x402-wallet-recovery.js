// A Concordium transaction hash is public chain data, not a payment
// signature or proof of entitlement. This helper is safe for browser bundles.
export const LAST_NATIVE_TX_KEY='trustgate:native-testnet:last-tx:v1';
// If the wallet was asked to submit but no transaction hash came back,
// preserve an explicit local warning across refreshes. This marker is NOT proof
// that a transaction was sent, failed or finalized.
export const LAST_NATIVE_UNCERTAIN_SUBMISSION_KEY='trustgate:native-testnet:uncertain-submission:v1';

export function normalizeNativeTransactionHash(value) {
  if (typeof value!=='string') return null;
  const normalized=value.trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(normalized)?normalized:null;
}

export function shouldHoldNativeCheckout(hash,verified,uncertainSubmission=false) {
  return uncertainSubmission===true ||
    (normalizeNativeTransactionHash(hash)!==null && verified!==true);
}

export function buildNativeInspectionRecord(response,observedAt) {
  if (!response || typeof response!=='object' ||
      !normalizeNativeTransactionHash(response.transaction) ||
      typeof observedAt!=='string' || !Number.isFinite(Date.parse(observedAt))) {
    throw Error('INVALID_NATIVE_INSPECTION_RECORD');
  }
  // Always attribute a browser-side verification time to the browser.
  // The returned result is a read-only live query, NOT a server-signed receipt.
  return {
    version:'trustgate-native-chain-inspection/v1',
    kind:'READ_ONLY_CURRENT_TESTNET_TRANSFER_CHECK',
    transaction:normalizeNativeTransactionHash(response.transaction),
    network:response.network,
    merchant:response.merchant,
    sponsor:response.sponsor,
    amountMicroCcd:response.amountMicroCcd,
    verified:response.verified===true,
    code:response.code||'UNVERIFIED',
    browserCheckedAt:observedAt,
    grantsPaidResource:false,
    serverAttested:false,
    x402ExactSettlement:false,
    warning:'Browser-captured public chain lookup. It does not bind this transfer to a paid x402 session, create an entitlement, or prove server issuance.'
  };
}
