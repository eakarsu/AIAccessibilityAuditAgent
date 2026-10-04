'use strict';
const dns = require('node:dns').promises;
const { isIP } = require('node:net');
const { authorizeTarget } = require('./auditPolicy');

function publicIPv4(address) {
  if (isIP(address) !== 4) return false;
  const [a, b, c] = address.split('.').map(Number);
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && (b === 168 || (b === 0 && c === 0) || (b === 0 && c === 2))) return false;
  if (a === 198 && ((b === 18 || b === 19) || (b === 51 && c === 100))) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

async function pinnedTarget(targetUrl, authorizedHost, resolver = dns.lookup) {
  const authorization = authorizeTarget(targetUrl, authorizedHost);
  if (!authorization.valid) throw new Error(`Target rejected: ${authorization.violations.join(', ')}`);
  const url = new URL(authorization.normalizedUrl);
  const records = await resolver(url.hostname, { all: true, verbatim: true });
  const ipv4 = records.filter(record => record.family === 4);
  if (!ipv4.length || ipv4.some(record => !publicIPv4(record.address))) {
    throw new Error('Target must resolve only to public IPv4 addresses for this worker.');
  }
  return { url: url.toString(), host: url.hostname, address: ipv4[0].address };
}

module.exports = { publicIPv4, pinnedTarget };
