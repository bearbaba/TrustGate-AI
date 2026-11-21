/**
 * Sponsor-wide abuse guard. A single atomic Redis EVAL per authenticated call
 * limits gas-sponsorship operations across all Vercel instances. No client IP,
 * signing key, bearer secret or account identifier is stored in the Redis key.
 * A Redis outage fails closed, before the official SDK gets a chance to sign.
 */
const LIMITS = Object.freeze({supported: 30, verify: 24, settle: 4, accounts: 15});
const TTL_SECONDS = 120;
const SETTLEMENT_DAILY_LIMIT = 8;
const DAILY_TTL_SECONDS = 172800;

export const SPONSOR_RATE_LIMIT_LUA = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
if count > tonumber(ARGV[2]) then return 0 end
if #KEYS == 2 then
  local dailyCount = redis.call('INCR', KEYS[2])
  if dailyCount == 1 then redis.call('EXPIRE', KEYS[2], ARGV[3]) end
  if dailyCount > tonumber(ARGV[4]) then return 0 end
end
return 1
`.trim();

export async function enforceSponsorRateLimit(config, action, {
  now = Date.now(),
  fetchImpl = fetch
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
  const dayKey='tg:x402:sponsor:daily-settle:' + Math.floor(now / 86400000);
  const isSettlement=action==='settle';
  const args=isSettlement ? [
    'EVAL',SPONSOR_RATE_LIMIT_LUA,'2',key,dayKey,
    String(TTL_SECONDS),String(LIMITS[action]),
    String(DAILY_TTL_SECONDS),String(SETTLEMENT_DAILY_LIMIT)
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
  if (body.result === 1 || body.result === '1') return true;
  if (body.result === 0 || body.result === '0') return false;
  throw Error('SPONSOR_LIMITER_INDETERMINATE');
}
