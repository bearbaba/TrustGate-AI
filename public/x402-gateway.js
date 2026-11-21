'use strict';
const $ = id => document.getElementById(id);
let enabled=false;
function row(message,checked) {
  const item=document.createElement('div');item.className='x402-check '+(checked?'ok':'missing');
  const mark=document.createElement('span');mark.textContent=checked?'✓':'○';
  const label=document.createElement('strong');label.textContent=message;
  item.append(mark,label);return item;
}
async function getStatus() {
  enabled=false;$('testQuote').disabled=true;
  $('gatewayStatus').textContent='Reading backend configuration…';
  try {
    const r=await fetch('/api/x402/status',{cache:'no-store'});
    if(!r.ok)throw Error('HTTP '+r.status);
    const data=await r.json();
    enabled=data.status==='CONFIGURED_NOT_PAYMENT_TESTED';
    $('gatewayStatus').className='status '+(enabled?'good':'');
    $('gatewayStatus').textContent=enabled?
      'Configured, but no real payment has been confirmed. Quote requires a live facilitator handshake.':
      'LOCKED — payment settlement is disabled until all prerequisites are configured.';
    $('merchantState').textContent=data.merchant||'Not configured';
    $('gatewayPrice').textContent=data.displayPrice||'0.1 Testnet CCD';
    const keys=[
      ['Enable Testnet payment gateway','ENABLE_TESTNET_GATEWAY'],
      ['Separate merchant Testnet wallet','SEPARATE_MERCHANT_ACCOUNT'],
      ['Supported HTTPS sponsor/facilitator','HTTPS_CONCORDIUM_FACILITATOR'],
      ['Durable atomic replay store','DURABLE_ATOMIC_REPLAY_STORE']
    ];
    $('readinessChecks').replaceChildren(...keys.map(([label,code])=>row(label,!data.prerequisites?.includes(code))));
    $('testQuote').disabled=!enabled;
    $('quoteResult').textContent=enabled?'Ready to request a protocol quote. No payment will be made.':'Gateway is locked until configured.';
  }catch(err){
    $('gatewayStatus').className='status bad';
    $('gatewayStatus').textContent='Could not verify server readiness: '+err.message;
    $('readinessChecks').replaceChildren();
  }
}
$('refreshStatus').addEventListener('click',getStatus);
$('testQuote').addEventListener('click',async()=>{
  $('testQuote').disabled=true;
  $('quoteResult').textContent='Checking official facilitator support…';
  try{
    const r=await fetch('/api/x402/quote',{cache:'no-store'});
    const d=await r.json();
    $('quoteResult').textContent=JSON.stringify(d,null,2);
  }catch(err){$('quoteResult').textContent='Quote failed: '+err.message;}
  finally{$('testQuote').disabled=!enabled;}
});
getStatus();

async function checkChainAccounts(){
  const button=$('chainCheck');
  button.disabled=true;
  $('chainStatus').className='status';
  $('chainStatus').textContent='Reading Concordium Testnet accounts (no wallet signature)…';
  try{
    const response=await fetch('/api/sponsor/accounts',{cache:'no-store'});
    const body=await response.json();
    if(!response.ok){
      const code=body.error||'CHAIN_STATUS_UNAVAILABLE';
      throw Error(code);
    }
    const ready=body.status==='ACCOUNTS_PRESENT_SPONSOR_HAS_CCD';
    $('chainStatus').className='status '+(ready?'good':'bad');
    $('chainStatus').textContent=ready?
      'Both accounts exist on Testnet and Sponsor has nonzero available CCD. Signing key and fee sufficiency are NOT verified; payments remain locked.':
      body.status==='ONCHAIN_LOOKUP_UNAVAILABLE'?
        'RPC unavailable: account existence and funding cannot be confirmed. Gateway remains locked.':
        'Not ready: Merchant and Sponsor must be on-chain and Sponsor must have available Testnet CCD. Status: '+body.status;
  }catch(error){
    $('chainStatus').className='status bad';
    $('chainStatus').textContent='Account status unavailable: '+(error?.message||'network error');
  }finally{button.disabled=false;}
}
$('chainCheck').addEventListener('click',checkChainAccounts);
