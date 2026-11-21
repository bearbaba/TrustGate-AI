import { handleSponsor } from '../../lib/x402-facilitator.js';
export default function handler(req,res){return handleSponsor(req,res,{path:'/api/sponsor/settle'});}
