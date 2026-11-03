import { test } from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../src/index';

test('health and demo lessons work without credentials', async () => {
  assert.equal((await app.request('/api/health', {}, {})).status, 200);
  const response = await app.request('/api/lessons', {}, {});
  const data = await response.json() as { demo: boolean; contents: unknown[] };
  assert.equal(data.demo, true);
  assert.equal(data.contents.length, 2);
});

test('partial configuration reports failure instead of silently using demo', async () => {
  assert.equal((await app.request('/api/lessons', {}, { MICROCMS_SERVICE_DOMAIN: 'example' })).status, 502);
});

test('microCMS request uses server credentials and escapes HTML', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), 'https://example.microcms.io/api/v1/lessons?limit=20&fields=id,title,description');
    assert.equal(new Headers(init?.headers).get('X-MICROCMS-API-KEY'), 'secret');
    return Response.json({ contents: [{ id: '1', title: '<script>alert(1)</script>', description: '<img src=x onerror=alert(1)>' }] });
  };
  try {
    const response = await app.request('/api/fragments/lessons', {}, { MICROCMS_SERVICE_DOMAIN: 'example', MICROCMS_API_KEY: 'secret' });
    const body = await response.text();
    assert.equal(response.status, 200);
    assert.ok(body.includes('&lt;script&gt;'));
    assert.ok(!body.includes('<script>'));
    assert.ok(!body.includes('secret'));
  } finally { globalThis.fetch = originalFetch; }
});

test('upstream failures and invalid schemas produce safe errors', async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const response of [new Response('secret upstream error', { status: 401 }), Response.json({ contents: [{}] })]) {
      globalThis.fetch = async () => response;
      const result = await app.request('/api/lessons', {}, { MICROCMS_SERVICE_DOMAIN: 'example', MICROCMS_API_KEY: 'secret' });
      assert.equal(result.status, 502);
      assert.ok(!(await result.text()).includes('secret'));
    }
  } finally { globalThis.fetch = originalFetch; }
});
