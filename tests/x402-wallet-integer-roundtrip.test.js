import test from 'node:test';
import assert from 'node:assert/strict';
import {SequenceNumber,buildBasicAccountSigner,jsonParse} from '@concordium/web-sdk';
import {Transaction} from '@concordium/web-sdk/transactions';
import {prepareSponsoredCcdTransaction} from '../lib/x402-browser-sponsored.js';
import {PROOF_CONTEXT} from '../lib/proof-message.js';
import {X402_TESTNET} from '../lib/x402-config.js';

// Mirrors the critical Concordium Wallet for Web code paths:
// wallet-api.ts sendSponsoredTransaction() -> stringify(Transaction.toJSON())
// -> payload-helpers.ts parse() -> Transaction.signableFromJSON()
// -> Transaction.signAndFinalize() when the user clicks Sign & Submit.
// This uses ONLY a published RFC8032 test seed and does not contact a chain.
const SEED='9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60';
const MERCHANT='4XYepvZZJyFkKTTgoTCmNuQYar1PBiscdZBh6cRotsG2Y7SBDf';
const SPONSOR='4Q9ZNet1wKBCS3HWYxBSrHjKPfyois52h3gYUUHKe8Fw4Cf3s3';
const sponsorConfig={
  address:SPONSOR,merchant:MERCHANT,network:X402_TESTNET,privateKey:SEED
};
const intent={account:PROOF_CONTEXT.owner};

function walletStringify(input){
  return JSON.stringify(input,(_key,value)=>
    typeof value==='bigint'?{'@type':'bigint',value:value.toString()}:value
  );
}
function walletParse(input){
  return jsonParse(input,(_key,value)=>{
    if(value && value['@type']==='bigint')return BigInt(value.value);
    if(value && value['@type']==='date')return new Date(value.value);
    return value;
  });
}

test('Concordium Wallet Sign & Submit can parse and sign exact sponsor V1 transaction',async()=>{
  const preparedJson=await prepareSponsoredCcdTransaction(sponsorConfig,intent,{
    fetchNonce:async()=>SequenceNumber.create(1n)
  });
  const browserSignable=Transaction.signableFromJSON(preparedJson);
  const passedToExtension=walletStringify(Transaction.toJSON(browserSignable));
  const parsedByExtension=walletParse(passedToExtension);
  const signable=Transaction.signableFromJSON(parsedByExtension);
  assert.equal(signable.version,1);
  const finalized=await Transaction.signAndFinalize(signable,buildBasicAccountSigner(SEED));
  assert.equal(finalized.version,1);
  // This is what the wallet's gRPC sendTransaction path serializes just
  // before broadcasting the user-approved transaction.
  const bytes=Transaction.serializeBlockItem(finalized);
  assert.ok(bytes.length>64);
  const hash=Transaction.getAccountTransactionHash(finalized);
  assert.equal(hash.length,32);
});
