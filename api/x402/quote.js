import { handleX402 } from '../../lib/x402-gateway.js';
export default function handler(req,res){return handleX402(req,res,{path:'/api/x402/quote'});}
