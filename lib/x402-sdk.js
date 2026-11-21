import { X402_TESTNET, X402_RESOURCE } from './x402-config.js';

/** Official x402 scheme. Only dynamically loaded after complete configuration. */
export async function makeConcordiumX402Server(config) {
  const [{ x402ResourceServer, HTTPFacilitatorClient }, { ExactConcordiumScheme }] = await Promise.all([
    import('@x402/core/server'),
    import('@x402/concordium/exact/server')
  ]);
  const auth=config.facilitatorAuthToken ?
    async () => {
      const headers={Authorization:'Bearer '+config.facilitatorAuthToken};
      return {supported:headers,verify:headers,settle:headers};
    } : undefined;
  const server=new x402ResourceServer(new HTTPFacilitatorClient({
    url:config.facilitatorUrl,timeoutMs:75000,createAuthHeaders:auth
  }));
  server.register(X402_TESTNET,new ExactConcordiumScheme());
  await server.initialize(); // requires /supported from actual sponsor/facilitator
  const [requirements]=await server.buildPaymentRequirements({
    scheme:'exact',network:X402_TESTNET,payTo:config.merchant,
    price:{amount:config.amountMicroCcd,asset:'CCD'},
    maxTimeoutSeconds:90
  });
  const feePayer=requirements?.extra?.feePayer;
  if(typeof feePayer !== 'string' || feePayer.length<45 ||
     feePayer === config.merchant || feePayer === undefined) throw Error('SPONSOR_NOT_ADVERTISED');
  if(requirements.network!==X402_TESTNET ||
     requirements.scheme!=='exact' || requirements.asset!=='CCD' ||
     requirements.amount!==config.amountMicroCcd || requirements.payTo!==config.merchant)
    throw Error('FACILITATOR_REQUIREMENTS_MISMATCH');
  const resource={
    url:'https://trustgate-ai.vercel.app'+X402_RESOURCE,
    description:'One payment for a verified Concordium Agent #1323 evidence package',
    mimeType:'application/json',serviceName:'TrustGate AI'
  };
  const paymentRequired=await server.createPaymentRequiredResponse([requirements],resource);
  return {server,requirements,paymentRequired};
}
