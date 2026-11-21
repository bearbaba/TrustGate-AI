import test from 'node:test';
import assert from 'node:assert/strict';
import { enforceSponsorRateLimit, SPONSOR_RATE_LIMIT_LUA } from '../lib/x402-sponsor-limiter.js';

const config={
  configured:true,redisUrl:'https://example.upstash.io',
  redisToken:'test-only-token'
};

function mock(result, capture) {
  return async (url,init)=>{
    capture.push({url,init});
    return {ok:true,json:async()=>({result})};
  };
}

test('Sponsor limits use one atomic Redis Lua EVAL with bounded quota',async()=>{
  const requests=[];
  for(const [action,limit] of [['supported',30],['verify',24],['settle',4]]){
    assert.equal(await enforceSponsorRateLimit(config,action,{
      now:Date.UTC(2026,10,21,6,0,0),
      fetchImpl:mock(1,requests)
    }),true);
    const cmd=JSON.parse(requests.at(-1).init.body);
    assert.deepEqual(cmd.slice(0,2),['EVAL',SPONSOR_RATE_LIMIT_LUA]);
    assert.equal(cmd[2],action==='settle'?'2':'1');
    assert.match(cmd[3],new RegExp('^tg:x402:sponsor:limit:'+action+':\\d+
    assert.equal(requests.at(-1).init.method,'POST');
    assert.equal(requests.at(-1).init.redirect,'error');
    assert.equal(requests.at(-1).init.headers.Authorization,'Bearer test-only-token');
    assert.equal(cmd[3].includes(config.redisToken),false);
  }
});

test('Exceeded minute or daily quota rejects calls and never assumes success',async()=>{
  assert.equal(await enforceSponsorRateLimit(config,'settle',{fetchImpl:mock(0,[])}),false);
  assert.equal(await enforceSponsorRateLimit(config,'verify',{fetchImpl:mock('0',[])}),false);
});

test('Redis failure, indeterminate answers and missing config always fail closed',async()=>{
  await assert.rejects(()=>enforceSponsorRateLimit(config,'verify',{
    fetchImpl:async()=>({ok:false,status:503})
  }));
  await assert.rejects(()=>enforceSponsorRateLimit(config,'verify',{
    fetchImpl:async()=>({ok:true,json:async()=>({error:'down'})})
  }));
  await assert.rejects(()=>enforceSponsorRateLimit(config,'verify',{
    fetchImpl:async()=>({ok:true,json:async()=>({result:null})})
  }));
  await assert.rejects(()=>enforceSponsorRateLimit({...config,redisToken:''},'settle'));
  await assert.rejects(()=>enforceSponsorRateLimit({...config,configured:false},'settle'));
  await assert.rejects(()=>enforceSponsorRateLimit(config,'unknown'));
});
));
    if(action==='settle'){
      assert.match(cmd[4],/^tg:x402:sponsor:daily-settle:\\d+$/);
      assert.deepEqual(cmd.slice(5),['120','4','172800','8']);
    }else{
      assert.deepEqual(cmd.slice(4),['120',String(limit)]);
    }
    assert.equal(requests.at(-1).init.method,'POST');
    assert.equal(requests.at(-1).init.redirect,'error');
    assert.equal(requests.at(-1).init.headers.Authorization,'Bearer test-only-token');
    assert.equal(cmd[3].includes(config.redisToken),false);
  }
});

test('Exceeded quota rejects calls and never assumes success',async()=>{
  assert.equal(await enforceSponsorRateLimit(config,'settle',{fetchImpl:mock(0,[])}),false);
  assert.equal(await enforceSponsorRateLimit(config,'verify',{fetchImpl:mock('0',[])}),false);
});

test('Redis failure, indeterminate answers and missing config always fail closed',async()=>{
  await assert.rejects(()=>enforceSponsorRateLimit(config,'verify',{
    fetchImpl:async()=>({ok:false,status:503})
  }));
  await assert.rejects(()=>enforceSponsorRateLimit(config,'verify',{
    fetchImpl:async()=>({ok:true,json:async()=>({error:'down'})})
  }));
  await assert.rejects(()=>enforceSponsorRateLimit(config,'verify',{
    fetchImpl:async()=>({ok:true,json:async()=>({result:null})})
  }));
  await assert.rejects(()=>enforceSponsorRateLimit({...config,redisToken:''},'settle'));
  await assert.rejects(()=>enforceSponsorRateLimit({...config,configured:false},'settle'));
  await assert.rejects(()=>enforceSponsorRateLimit(config,'unknown'));
});
