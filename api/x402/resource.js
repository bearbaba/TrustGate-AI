export const maxDuration = 120;
import { handleX402 } from '../../lib/x402-gateway.js';
import { handleBrowserSponsoredPrepare } from '../../lib/x402-browser-sponsored.js';
import { handleBrowserSponsoredInspect } from '../../lib/x402-browser-inspect.js';

/** One Vercel Serverless Function keeps the Hobby plan within its free limit. */
export default function handler(req,res) {
  if(req.query?.mode==='browser-prepare')
    return handleBrowserSponsoredPrepare(req,res);
  if(req.query?.mode==='browser-inspect')
    return handleBrowserSponsoredInspect(req,res);
  return handleX402(req,res,{path:'/api/x402/resource'});
}
