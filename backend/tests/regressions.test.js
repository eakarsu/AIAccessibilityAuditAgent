const test=require('node:test'),assert=require('node:assert/strict'),p=require('../domain/auditPolicy');
test('private literals are blocked without blocking fc-prefixed public domains',()=>{for(const host of ['172.16.1.1','[::1]','[::ffff:127.0.0.1]','[fe80::1]'])assert.equal(p.authorizeTarget('http://'+host,host).valid,false);assert.equal(p.authorizeTarget('https://fcdesign.com','fcdesign.com').valid,true);});
test('malformed findings and run dates produce validation errors, not crashes or success',()=>{const base={targetUrl:'https://example.com',authorizedHost:'example.com',authorizationReference:'a',sourceRevision:'r'};for(const findings of [{},'bad',[null]])assert.equal(p.validateAuditEvidence({...base,axeRun:{runId:'x',engineVersion:'1',startedAt:'bad',completedAt:'bad',findings}}).valid,false);});
test('runtime acceptance loads without credentials and only provisions when RUNTIME_SETUP=1',()=>{
  const modulePath=require.resolve('../runtimeAcceptance');
  const saved={};
  for(const key of ['DATABASE_URL','RUNTIME_AI_ENDPOINT','RUNTIME_SETUP','PROVISION_ADMIN_EMAIL','PROVISION_ADMIN_PASSWORD'])saved[key]=process.env[key];
  process.env.DATABASE_URL='postgresql://unused';process.env.RUNTIME_AI_ENDPOINT='/api/ai/regression';
  delete process.env.RUNTIME_SETUP;delete process.env.PROVISION_ADMIN_EMAIL;delete process.env.PROVISION_ADMIN_PASSWORD;
  try{
    delete require.cache[modulePath];
    assert.doesNotThrow(()=>require('../runtimeAcceptance'));
    process.env.RUNTIME_SETUP='1';
    delete require.cache[modulePath];
    assert.throws(()=>require('../runtimeAcceptance'),/RUNTIME_SETUP=1/);
  }finally{
    for(const key of Object.keys(saved)){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}
    delete require.cache[modulePath];
  }
});
test('auth middleware recognizes runtime session token shape',()=>{
  const auth=require('../middleware/auth');
  assert.equal(auth.isRuntimeSessionToken('a'.repeat(64)),true);
  assert.equal(auth.isRuntimeSessionToken('eyJhbGciOiJIUzI1NiJ9.payload.signature'),false);
  assert.equal(auth.isRuntimeSessionToken(undefined),false);
});
