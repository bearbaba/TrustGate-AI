/**
 * Sponsor-wide abuse guard. A single atomic Redis EVAL per authenticated call
 * limits gas-sponsorship operations across all Vercel instances. No client IP,
 * signing key, bearer secret or account identifier is stored in the Redis key.
 * A Redis outage fails closed, before the official SDK gets a chance to sign.
 */
// High, still finite TESTNET allowances: repeated READ-ONLY checks and failed wallet
// approval dialogs must not consume the day's small production-style budget.
// Actual signer scope, Sponsor funding and Redis replay protection are separate.
const LIMITS = Object.freeze({supported: 120, verify: 48, settle: 4, prepare: 20, accounts: 240});
const TTL_SECONDS = 120;
const SETTLEMENT_DAILY_LIMIT = 8;
// A failed browser-wallet approval still consumes one preparation. Keep a bounded
// Testnet testing budget without locking the Owner out after four wallet failures.
const PREPARE_DAILY_LIMIT = 240;
const DAILY_TTL_SECONDS = 172800;

export const SPONSOR_RATE_LIMIT_LUA = `
-- Check both caps before incrementing either. Rejected requests do not exhaust
-- the other counter. Atomic Redis EVAL preserves the existing abuse guard.
if tonumber(redis.call('GET', KEYS[1]) or '0') >= tonumber(ARGV[2]) then return -1 end
if #KEYS == 2 and tonumber(redis.call('GET', KEYS[2]) or '0') >= tonumber(ARGV[4]) then return -2 end
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
if #KEYS == 2 then
  local dailyCount = redis.call('INCR', KEYS[2])
  if dailyCount == 1 then redis.call('EXPIRE', KEYS[2], ARGV[3]) end
end
return 1
`.trim();

export async function enforceSponsorRateLimit(config, action, {
  now = Date.now(),
  fetchImpl = fetch,
  includeReason = false
} = {}) {
  if (!Object.hasOwn(LIMITS, action)) throw Error('INVALID_SPONSOR_ACTION');
  // Public account checks run while the payment gateway is deliberately
  // disabled. They still require the dedicated Redis credentials and an
  // atomic global quota before any potentially costly Testnet gRPC request.
  if ((!config?.configured && action !== 'accounts') ||
      !config?.redisUrl || !config?.redisToken)
    throw Error('SPONSOR_LIMITER_NOT_CONFIGURED');
  if (!Number.isFinite(now) || now < 0) throw Error('INVALID_TIME');
  const bucket = Math.floor(now / 60000);
  const key = 'tg:x402:sponsor:limit:' + action + ':' + bucket;
  const dayKey='tg:x402:sponsor:daily-'+action+':' + Math.floor(now / 86400000);
  const hasDailyCap=action==='settle'||action==='prepare';
  const dailyLimit=action==='prepare'?PREPARE_DAILY_LIMIT:SETTLEMENT_DAILY_LIMIT;
  const args=hasDailyCap ? [
    'EVAL',SPONSOR_RATE_LIMIT_LUA,'2',key,dayKey,
    String(TTL_SECONDS),String(LIMITS[action]),
    String(DAILY_TTL_SECONDS),String(dailyLimit)
  ] : [
    'EVAL',SPONSOR_RATE_LIMIT_LUA,'1',key,
    String(TTL_SECONDS),String(LIMITS[action])
  ];
  const response = await fetchImpl(config.redisUrl, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + config.redisToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(args),
    redirect: 'error',
    signal: AbortSignal.timeout(4500),
    cache: 'no-store'
  });
  if (!response.ok) throw Error('SPONSOR_LIMITER_UNAVAILABLE');
  const body = await response.json();
  if (!body || body.error !== undefined) throw Error('SPONSOR_LIMITER_UNAVAILABLE');
  if (body.result === 1 || body.result === '1')
    return includeReason ? {ok:true} : true;
  const result=Number(body.result);
  if (body.result === 0 || body.result === '0' || result === -1 || result === -2) {
    if(!includeReason)return false;
    const scope=result===-2?'daily':result===-1?'minute':'unknown';
    const untilNext=scope==='daily'?86400000-(now%86400000):
      scope==='minute'?60000-(now%60000):null;
    return {ok:false,scope,
      retryAfterSeconds:untilNext===null?null:Math.max(1,Math.ceil(untilNext/1000))};
  }
  throw Error('SPONSOR_LIMITER_INDETERMINATE');
}
