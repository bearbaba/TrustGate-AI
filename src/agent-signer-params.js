import { Parameter, serializeSchemaType, serializeTypeValue } from '@concordium/web-sdk';

export const AGENT = Object.freeze({
  tokenId: 1323,
  badge: 'JyP9UhV91L3jWGjHH4aB7',
  owner: '34C1ozW8edKtBmA8FUFoR4aBys8ofuwtRmYqqbzNVPAsATT4wk',
  genesisPrefix: '4221332d34e1694168c2a0c0b3fd0f27',
  contractIndex: 12802n,
  contractSubindex: 0n,
  entrypoint: 'CIS-8004.setAgentURI',
  cardUrl: 'https://trustgate-ai.vercel.app/.well-known/agent-card.json',
  cardHash: 'ed33956577d378ef0bfd537505863d846a2c130513302a2d45d99e5bfc009c44',
  parameterHex: '082b05000000000000013b00000068747470733a2f2f7472757374676174652d61692e76657263656c2e6170702f2e77656c6c2d6b6e6f776e2f6167656e742d636172642e6a736f6e01ed33956577d378ef0bfd537505863d846a2c130513302a2d45d99e5bfc009c44',
});
const option = (inner) => ({
  type: 'Enum',
  variants: [
    { name: 'None', fields: { type: 'None' } },
    { name: 'Some', fields: { type: 'Unnamed', fields: [inner] } },
  ],
});
// A parameter-only schema avoids a wallet gRPC/module-source dependency.
// Its serialization MUST match the exact bytes returned by Concordium's
// build-set-agent-uri REST endpoint before the wallet can sign.
export const PARAMETER_SCHEMA_TYPE = {
  type: 'Struct',
  fields: {
    type: 'Named',
    fields: [
      { name: 'token_id', field: { type: 'ByteList', sizeLength: 'U8' } },
      { name: 'agent_uri', field: option({ type: 'String', sizeLength: 'U32' }) },
      { name: 'metadata_hash', field: option({ type: 'Array', size: 32, item: { type: 'U8' } }) },
    ],
  },
};
export const PARAMETER_JSON = Object.freeze({
  token_id: '2b05000000000000',
  agent_uri: { Some: [AGENT.cardUrl] },
  metadata_hash: { Some: [Array.from(AGENT.cardHash.match(/../g), x => Number.parseInt(x, 16))] },
});
export function getSigningParameter() {
  const schema = serializeSchemaType(PARAMETER_SCHEMA_TYPE);
  const payload = serializeTypeValue(PARAMETER_JSON, schema);
  const encoded = Parameter.toHexString(payload).toLowerCase();
  if (encoded !== AGENT.parameterHex) {
    throw new Error('CONTRACT_PARAMETER_MISMATCH: the locally encoded parameter differs from the official builder output.');
  }
  return { schema, encoded };
}
