import test from 'node:test';
import assert from 'node:assert/strict';
import { AGENT, PARAMETER_JSON, getSigningParameter } from '../src/agent-signer-params.js';

test('Concordium setAgentURI schema encodes the exact official builder payload', () => {
  const {schema, encoded} = getSigningParameter();
  assert.equal(encoded, AGENT.parameterHex);
  assert.ok(schema.byteLength > 30);
  assert.equal(PARAMETER_JSON.token_id, '2b05000000000000');
  assert.equal(PARAMETER_JSON.agent_uri.Some[0], AGENT.cardUrl);
  assert.equal(PARAMETER_JSON.metadata_hash.Some[0].length, 32);
});
