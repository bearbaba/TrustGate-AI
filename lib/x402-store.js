import { createHash } from 'node:crypto';

/**
 * Upstash Redis REST atomic SET NX used as a fail-closed settlement replay gate.
 * In-progress locks are deliberately not released after an ambiguous settle:
 * retrying could create a duplicate charge. Production recovery requires a
 * separate operator reconciliation workflow.
 */
const hash = input => createHash('sha256').update(input).digest('hex');
async function command(config, args, fetchImpl=fetch) {
  if (!config.configured) throw Error('STORAGE_NOT_CONFIGURED');
  const response=await fetchImpl(config.redisUrl,{
    method:'POST',
    headers:{Authorization:'Bearer '+config.redisToken,'Content-Type':'application/json'},
    body:JSON.stringify(args),redirect:'error',
    signal:AbortSignal.timeout(4500),cache:'no-store'
  });
  if(!response.ok)throw Error('STORAGE_UNAVAILABLE');
  const result=await response.json();
  if(result.error)throw Error('STORAGE_UNAVAILABLE');
  return result.result;
}
export function replayKeys(intent, paymentPayload) {
  return {
    intentKey: 'tg:x402:intent:'+hash(intent.account+':'+intent.nonce),
    paymentKey:'tg:x402:payload:'+hash(JSON.stringify(paymentPayload))
  };
}
export async function reserveX402Payment(config,intent,paymentPayload,fetchImpl=fetch) {
  const keys=replayKeys(intent,paymentPayload);
  const first=await command(config,['SET',keys.intentKey,'IN_PROGRESS','EX',86400,'NX'],fetchImpl);
  if(first!=='OK')return {ok:false,code:'INTENT_REPLAY_OR_IN_PROGRESS'};
  const second=await command(config,['SET',keys.paymentKey,'IN_PROGRESS','EX',86400,'NX'],fetchImpl);
  if(second!=='OK')return {ok:false,code:'PAYMENT_REPLAY_OR_IN_PROGRESS'};
  return {ok:true,keys};
}
export async function markX402Settled(config,keys,txHash,fetchImpl=fetch) {
  const record=JSON.stringify({status:'SETTLED',transaction:txHash});
  // Failure means the paid response must fail closed, leaving the nonce locks.
  const a=await command(config,['SET',keys.intentKey,record,'EX',604800],fetchImpl);
  const b=await command(config,['SET',keys.paymentKey,record,'EX',604800],fetchImpl);
  if(a!=='OK'||b!=='OK')throw Error('SETTLEMENT_PERSISTENCE_FAILED');
  return true;
}
