import { createHash } from 'node:crypto';

/**
 * Atomic replay reservation and settlement evidence for the exact-payment
 * Concordium Testnet path. A single Upstash Redis EVAL is used for each
 * state transition. The two keys must never be written in separate requests,
 * because a partial Redis failure would leave the settlement state divergent.
 *
 * EVAL executes atomically on the Redis server; if the store is unavailable
 * or does not support scripts we fail closed and never initiate settlement.
 */
const hash = input => createHash('sha256').update(input).digest('hex');
const INTENT_PREFIX='tg:x402:intent:';
const PAYLOAD_PREFIX='tg:x402:payload:';
const IN_PROGRESS='IN_PROGRESS';
const RESERVATION_TTL=86400; // 24h: ambiguous settlement requires operator reconciliation
const SETTLED_TTL=604800; // 7 days: serialized settlement evidence

export const RESERVE_LUA = `
if redis.call('EXISTS', KEYS[1], KEYS[2]) > 0 then return 0 end
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
redis.call('SET', KEYS[2], ARGV[1], 'EX', ARGV[2])
return 1
`.trim();

export const MARK_SETTLED_LUA = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
if redis.call('GET', KEYS[2]) ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[3])
return 1
`.trim();

async function command(config,args,fetchImpl=fetch) {
  if (!config.redisUrl || !config.redisToken || !config.configured)
    throw Error('STORAGE_NOT_CONFIGURED');
  const response=await fetchImpl(config.redisUrl,{
    method:'POST',
    headers:{Authorization:'Bearer '+config.redisToken,'Content-Type':'application/json'},
    body:JSON.stringify(args),redirect:'error',
    signal:AbortSignal.timeout(4500),cache:'no-store'
  });
  if(!response.ok)throw Error('STORAGE_UNAVAILABLE');
  const result=await response.json();
  if (!result || typeof result!=='object' || result.error!==undefined)
    throw Error('STORAGE_UNAVAILABLE');
  return result.result;
}

export function replayKeys(intent,paymentPayload) {
  return {
    intentKey: INTENT_PREFIX+hash(intent.account+':'+intent.nonce),
    paymentKey: PAYLOAD_PREFIX+hash(JSON.stringify(paymentPayload))
  };
}

export async function reserveX402Payment(config,intent,paymentPayload,fetchImpl=fetch) {
  const keys=replayKeys(intent,paymentPayload);
  const result=await command(config,[
    'EVAL',RESERVE_LUA,'2',keys.intentKey,keys.paymentKey,
    IN_PROGRESS,String(RESERVATION_TTL)
  ],fetchImpl);
  if(result===0 || result==='0')return {ok:false,code:'INTENT_OR_PAYMENT_REPLAY'};
  if(result!==1 && result!=='1')throw Error('STORAGE_RESERVATION_INDETERMINATE');
  return {ok:true,keys};
}

export async function markX402Settled(config,keys,txHash,fetchImpl=fetch) {
  if(!keys || typeof keys.intentKey!=='string' || typeof keys.paymentKey!=='string' ||
     !keys.intentKey.startsWith(INTENT_PREFIX) || !keys.paymentKey.startsWith(PAYLOAD_PREFIX) ||
     typeof txHash!=='string' || !/^[a-f0-9]{64}$/i.test(txHash))
    throw Error('INVALID_SETTLEMENT_RECORD');
  const record=JSON.stringify({status:'SETTLED',transaction:txHash});
  const result=await command(config,[
    'EVAL',MARK_SETTLED_LUA,'2',keys.intentKey,keys.paymentKey,
    IN_PROGRESS,record,String(SETTLED_TTL)
  ],fetchImpl);
  if(result!==1 && result!=='1')throw Error('SETTLEMENT_PERSISTENCE_FAILED');
  return true;
}
