'use strict';
const {isIP}=require('node:net');
function privateHost(host) {
 const h=host.replace(/^\[|\]$/g,'').toLowerCase().replace(/\.$/,'');
 if(h==='localhost'||h.endsWith('.localhost')||h.endsWith('.local')||h.endsWith('.internal'))return true;
 if(isIP(h)===4){const [a,b]=h.split('.').map(Number);return a===0||a===10||a===127||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&b===168||a===100&&b>=64&&b<=127||a>=224;}
 // Accept only global-unicast IPv6 literals; excludes loopback, mapped IPv4,
 // unique-local, link-local, multicast and unspecified addresses.
 if(isIP(h)===6)return !/^[23][0-9a-f]{3}:/.test(h);
 return false;
}
function authorizeTarget(targetUrl,scopeHost){
 const violations=[];let parsed;
 try{parsed=new URL(targetUrl);}catch{return{valid:false,violations:['invalid_url']};}
 const host=parsed.hostname.toLowerCase().replace(/\.$/,''),scope=String(scopeHost||'').toLowerCase().replace(/\.$/,'');
 if(!['https:','http:'].includes(parsed.protocol))violations.push('unsupported_protocol');
 if(!scope||(host!==scope&&!host.endsWith(`.${scope}`)))violations.push('outside_authorized_scope');
 if(privateHost(host))violations.push('private_target_blocked');
 if(parsed.username||parsed.password)violations.push('embedded_credentials_blocked');
 return{valid:violations.length===0,violations,normalizedUrl:parsed.toString()};
}
function validateAuditEvidence(input={}){
 const target=authorizeTarget(input?.targetUrl,input?.authorizedHost),violations=[...target.violations];
 if(!input?.authorizationReference||!input?.sourceRevision)violations.push('authorization_and_revision_required');
 const run=input?.axeRun||{},findings=Array.isArray(run.findings)?run.findings:[];
 const start=Date.parse(run.startedAt),end=Date.parse(run.completedAt);
 if(!run.runId||!run.engineVersion||!Number.isFinite(start)||!Number.isFinite(end)||end<start||!Array.isArray(run.findings))violations.push('reproducible_axe_run_required');
 for(const [i,f]of findings.entries())if(!f||!f.ruleId||!f.wcagCriterion||!['critical','serious','moderate','minor'].includes(f.impact)||!f.selector||!f.evidenceHash)violations.push(`finding_${i}_evidence_incomplete`);
 return{valid:violations.length===0,violations,report:violations.length?null:{targetUrl:target.normalizedUrl,sourceRevision:input.sourceRevision,runId:run.runId,engineVersion:run.engineVersion,findingCount:findings.length,manualAssistiveTechnologyReviewRequired:true,automatedPassIsNotCertification:true}};
}
module.exports={authorizeTarget,validateAuditEvidence};
