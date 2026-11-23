/**
 * Independent, read-only simulation of Concordium Wallet's sponsored
 * transaction JSON transport. It does NOT sign, submit, reserve a nonce,
 * inspect secret keys or grant access to the paid resource.
 *
 * Concordium Wallet for Web (2.x) serializes Transaction.toJSON(signable)
 * with a typed bigint wrapper, then parses that wrapper in the popup
 * before invoking Transaction.signableFromJSON on Sign & Submit.
 *
 * An exception "value is not an integer" originates at one of the
 * SDK's version/executionEnergyAmount integer checks. Report types only:
 * never return the transaction JSON or any cryptographic signatures.
 */
import {jsonParse} from '@concordium/web-sdk';
import {Transaction} from '@concordium/web-sdk/transactions';

function walletStringify(obj) {
  return JSON.stringify(obj,function(_key,value){
    if(typeof value==='bigint')return {'@type':'bigint',value:value.toString()};
    return value;
  });
}

function walletParse(input) {
  return jsonParse(input,(_key,value)=>{
    if(value && typeof value==='object' && value['@type']==='bigint')
      return BigInt(value.value);
    return value;
  });
}

export function inspectSponsoredWalletJsonTypes(txJson) {
  let decoded;
  try {
    decoded=walletParse(walletStringify(txJson));
  } catch {
    return {ok:false,code:'WALLET_JSON_ROUNDTRIP_INVALID',
      versionType:'unknown',executionEnergyAmountType:'unknown'};
  }
  const versionType=typeof decoded?.version;
  const executionEnergyAmountType=typeof decoded?.header?.executionEnergyAmount;
  const versionInteger=(versionType==='number' && Number.isSafeInteger(decoded.version)) ||
    versionType==='bigint';
  const energyInteger=(executionEnergyAmountType==='number' &&
    Number.isSafeInteger(decoded.header.executionEnergyAmount)) ||
    executionEnergyAmountType==='bigint';
  const types={versionType,executionEnergyAmountType};
  if(!versionInteger || !energyInteger)
    return {ok:false,code:'WALLET_SIGNABLE_INTEGER_FIELD_INVALID',...types};
  try { Transaction.signableFromJSON(decoded); }
  catch {
    return {ok:false,code:'WALLET_SIGNABLE_ROUNDTRIP_FAILED',...types};
  }
  return {ok:true,code:'WALLET_SIGNABLE_ROUNDTRIP_OK',...types};
}

export function inspectSponsoredWalletWire(signable) {
  try{return inspectSponsoredWalletJsonTypes(Transaction.toJSON(signable));}
  catch {
    return {ok:false,code:'WALLET_SDK_SERIALIZATION_FAILED',
      versionType:'unknown',executionEnergyAmountType:'unknown'};
  }
}
