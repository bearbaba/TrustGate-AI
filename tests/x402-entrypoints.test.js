import test from 'node:test';
import assert from 'node:assert/strict';
import statusHandler from '../api/x402/status.js';
import quoteHandler from '../api/x402/quote.js';
import resourceHandler from '../api/x402/resource.js';

// Importing the actual Vercel entrypoints (not just the shared library)
// catches incorrect relative import paths before deployment.
function fakeResponse() {
  const result = { statusCode:null, body:null, headers:{} };
  return {
    result,
    setHeader(name, value) { result.headers[name] = value; },
    status(code) { result.statusCode = code; return { json(body) { result.body = body; return result; } }; }
  };
}
async function invoke(handler, method='GET') {
  const response = fakeResponse();
  await handler({ method, headers:{} }, response);
  return response.result;
}

test('nested Vercel x402 status entrypoint imports correctly and reports LOCKED on empty config', async () => {
  const keys = [
    'TRUSTGATE_X402_ENABLED','TRUSTGATE_X402_MERCHANT_ADDRESS',
    'TRUSTGATE_X402_FACILITATOR_URL','TRUSTGATE_X402_REDIS_URL',
    'TRUSTGATE_X402_REDIS_TOKEN'
  ];
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    for (const key of keys) delete process.env[key];
    const status = await invoke(statusHandler);
    assert.equal(status.statusCode, 200);
    assert.equal(status.body.status, 'LOCKED_UNTIL_CONFIGURED');
    assert.equal(status.body.x402SettlementConfirmed, false);
    assert.ok(status.body.prerequisites.includes('SEPARATE_MERCHANT_ACCOUNT'));

    const quote = await invoke(quoteHandler);
    assert.equal(quote.statusCode, 503);
    assert.equal(quote.body.error, 'X402_NOT_CONFIGURED');

    const resource = await invoke(resourceHandler);
    assert.equal(resource.statusCode, 503);
    assert.equal(resource.body.error, 'X402_NOT_CONFIGURED');
  } finally {
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
});

test('nested Vercel entrypoints reject methods other than GET', async () => {
  for (const handler of [statusHandler, quoteHandler, resourceHandler]) {
    const response = await invoke(handler, 'POST');
    assert.equal(response.statusCode, 405);
    assert.equal(response.body.error, 'METHOD_NOT_ALLOWED');
  }
});
