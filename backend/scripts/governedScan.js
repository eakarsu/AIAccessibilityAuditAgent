#!/usr/bin/env node
'use strict';
// Operator-run worker. No API endpoint launches a browser against arbitrary URLs.
const fs = require('node:fs').promises;
const crypto = require('node:crypto');
const path = require('node:path');
const puppeteer = require('puppeteer');
const { pinnedTarget } = require('../domain/browserTarget');

function args(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i], value = argv[i + 1];
    if (!key?.startsWith('--') || !value || value.startsWith('--')) throw new Error('Expected --url, --host, --authorization, --revision and --output.');
    result[key.slice(2)] = value;
  }
  for (const key of ['url', 'host', 'authorization', 'revision', 'output']) if (!result[key]) throw new Error(`--${key} is required.`);
  return result;
}

async function main() {
  const input = args(process.argv.slice(2));
  const target = await pinnedTarget(input.url, input.host);
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-proxy-server', `--host-resolver-rules=MAP ${target.host} ${target.address}`],
  });
  try {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', request => {
      try {
        const resource = new URL(request.url());
        if (['about:', 'data:', 'blob:'].includes(resource.protocol)) return request.continue();
        if (['https:', 'http:'].includes(resource.protocol) && resource.hostname === target.host) return request.continue();
      } catch (_) {}
      return request.abort();
    });
    const startedAt = new Date().toISOString();
    await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    if (new URL(page.url()).hostname !== target.host) throw new Error('Navigation left authorized host.');
    await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
    const run = await page.evaluate(async () => {
      const result = await window.axe.run(document);
      return { version: window.axe.version, violations: result.violations };
    });
    const completedAt = new Date().toISOString();
    const findings = run.violations.flatMap(violation => violation.nodes.map(node => {
      const tag = (violation.tags || []).find(value => /^wcag\d{3}$/.test(value));
      const evidence = {
        ruleId: violation.id, target: node.target,
        html: node.html, checks: [...(node.any || []), ...(node.all || []), ...(node.none || [])].map(check => check.id),
      };
      return {
        ruleId: violation.id,
        wcagCriterion: tag ? tag.slice(4).split('').join('.') : 'rule-specific',
        impact: ['critical', 'serious', 'moderate', 'minor'].includes(violation.impact) ? violation.impact : 'moderate',
        selector: (node.target || []).join(' > '),
        evidenceHash: `sha256:${crypto.createHash('sha256').update(JSON.stringify(evidence)).digest('hex')}`,
      };
    })).filter(item => item.selector).slice(0, 500);
    const payload = {
      targetUrl: target.url,
      authorizedHost: input.host,
      authorizationReference: input.authorization,
      sourceRevision: input.revision,
      axeRun: {
        runId: `scan:${crypto.randomUUID()}`, engineVersion: run.version,
        startedAt, completedAt, findings,
      },
      workerLimits: { sameHostOnly: true, thirdPartyResourcesBlocked: true, findingsLimit: 500 },
    };
    await fs.writeFile(path.resolve(input.output), JSON.stringify(payload, null, 2), { flag: 'wx', mode: 0o600 });
    process.stdout.write(`Wrote ${findings.length} finding references to ${input.output}\n`);
  } finally {
    await browser.close();
  }
}

if (require.main === module) main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
module.exports = { args };
