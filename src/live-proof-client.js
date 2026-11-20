import { detectConcordiumProvider } from '@concordium/browser-wallet-api-helpers';
import { buildSignedMessage, PROOF_CONTEXT } from '../lib/proof-message.js';
const $ = x => document.getElementById(x);
let result = null;
const setMessage = (text,kind='') => { $('flow-status').textContent=text; $('flow-status').className='status '+kind; };
function setStage(stage,kind){ const el=$('flow-'+stage);if(el)el.dataset.state=kind; }
function render(r){
  result=r;
  $('result').hidden=false;
  $('verdict').textContent=r.decision;
  $('verdict').className='proof-verdict '+r.decision.toLowerCase();
  $('reasons').textContent=(r.reasons||[]).join(' · ');
  $('receipt').textContent=r.receipt?JSON.stringify(r.receipt,null,2):'No evidence delivered.';
  $('download').disabled=!r.receipt;
}
$('run').addEventListener('click',async()=>{
  const button=$('run');button.disabled=true;$('result').hidden=true;
  for(const x of ['wallet','signature','registry','policy'])setStage(x,'idle');
  try{
    setMessage('Connecting to Concordium Wallet…');setStage('wallet','active');
    const wallet=await detectConcordiumProvider(4000);
    const account=await wallet.connect();
    if(account!==PROOF_CONTEXT.owner)throw Error('Use the registered owner wallet ending ATT4wk.');
    const chain=await wallet.getSelectedChain();
    if(typeof chain!=='string'||!chain.toLowerCase().startsWith('4221332d34e1694168c2a0c0b3fd0f27'))throw Error('Switch Concordium Wallet to Testnet.');
    setStage('wallet','pass');
    const amountUsd=$('proof-amount').value;
    const purpose=$('proof-purpose').value.trim();
    const bytes=crypto.getRandomValues(new Uint8Array(16));
    const nonce=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
    const payload={
      badge:PROOF_CONTEXT.badge,account,service:PROOF_CONTEXT.service,
      amountUsd,purpose,nonce,issuedAt:Date.now()
    };
    setStage('signature','active');
    setMessage('Review and sign the read-only request in Concordium Wallet. No transaction or fee.');
    const signature=await wallet.signMessage(account,buildSignedMessage(payload));
    setStage('signature','pass');
    setStage('registry','active');
    setMessage('Checking signature against Testnet credentials and querying Concordium Registry…');
    const response=await fetch('/api/live-proof',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,signature}),cache:'no-store'});
    if(!response.ok)throw Error('Service unavailable (HTTP '+response.status+').');
    const data=await response.json();
    render(data);
    if(data.decision==='ALLOW'){
      setStage('registry','pass');setStage('policy','pass');setMessage('Verified! A fresh, read-only evidence receipt was issued. No funds moved.','good');
    }else if(data.decision==='REVIEW'){
      setStage('registry','pass');setStage('policy','review');setMessage('Human review required. Evidence was not issued.','bad');
    }else{
      setStage('registry','fail');setStage('policy','fail');setMessage('Request denied: '+data.reasons.join(', '),'bad');
    }
  }catch(err){
    setMessage('Request not completed: '+(err?.message||'Wallet or network error'),'bad');
    console.error('[TrustGate live proof]',err);
  }finally{button.disabled=false;}
});
$('download').addEventListener('click',()=>{
  if(!result?.receipt)return;
  const blob=new Blob([JSON.stringify(result,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');
  a.href=url;a.download='trustgate-live-proof-'+result.id+'.json';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
});
