'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { publicIPv4, pinnedTarget } = require('../domain/browserTarget');

test('worker pins an authorized public address', async () => {
  const result = await pinnedTarget('https://docs.example.com/a', 'example.com', async () => [{ address: '8.8.8.8', family: 4 }]);
  assert.equal(result.host, 'docs.example.com');
  assert.equal(result.address, '8.8.8.8');
});

test('worker rejects reserved addresses and out-of-scope hosts before launching Chrome', async () => {
  for (const address of ['127.0.0.1', '169.254.169.254', '192.0.2.4', '198.18.0.1', '203.0.113.3']) {
    assert.equal(publicIPv4(address), false);
    await assert.rejects(
      pinnedTarget('https://docs.example.com/a', 'example.com', async () => [{ address, family: 4 }]),
      /public IPv4/
    );
  }
  await assert.rejects(
    pinnedTarget('https://other.example.net/a', 'example.com', async () => [{ address: '8.8.8.8', family: 4 }]),
    /outside_authorized_scope/
  );
});
