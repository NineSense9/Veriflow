import { chromium } from '@playwright/test';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const base = process.env.AUDIT_URL || 'http://127.0.0.1:3100';
const out = path.resolve('../../output/readability', new URL(base).hostname);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : 'chromium', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto(base + '/login');
  await page.locator('#user').fill('demo');
  await page.locator('#pass').fill('demo');
  await page.locator('button[type=submit]').click();
  await page.waitForURL(base + '/');
  await page.locator('.graph-surface .react-flow__node').first().waitFor();
  const nodes = await page.locator('.graph-surface').evaluate(el => {
    const box = el.getBoundingClientRect();
    return [...el.querySelectorAll('.react-flow__node')].map(node => {
      const r = node.getBoundingClientRect();
      return { visible: r.left >= box.left-1 && r.right <= box.right+1 && r.top >= box.top-1 && r.bottom <= box.bottom+1, width:r.width };
    });
  });
  assert(nodes.length > 0 && nodes.every(node => node.visible), 'Initial graph must fit');
  await page.locator('.vf-viz').screenshot({ path:path.join(out,'workflow.png') });
  await page.getByRole('button', { name:'证据图', exact:true }).click();
  await page.getByRole('region', { name:'当前问题局部证据链' }).waitFor();
  await page.locator('.vf-viz').screenshot({ path:path.join(out,'evidence.png') });
  await page.goto(base + '/algorithms');
  await page.locator('.chroma-info .name a').first().waitFor();
  assert.equal(await page.locator('.chroma-overlay,.chroma-fade').count(),0);
  const count = await page.locator('.chroma-card').count();
  await page.screenshot({ path:path.join(out,'algorithms.png'), fullPage:true });
  await page.locator('.chroma-info .name a').first().click();
  await page.locator('main h1').waitFor();
  await page.goto(base + '/architecture');
  assert.equal(await page.locator('.architecture-band').count(),5);
  await page.locator('.architecture-module').first().click();
  await page.getByRole('region', { name:'模块详情' }).waitFor();
  await page.screenshot({ path:path.join(out,'architecture.png'),fullPage:true });
  for (const route of ['/compose','/evidence','/benchmark','/history','/settings','/problems']) {
    console.log('Checking', route);
    await page.goto(base + route);
    await page.locator('h1').waitFor();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), route + ' overflow');
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ base, nodes:nodes.length, algorithms:count, checkedRoutes:11, pageErrors:errors, screenshots:out }));
} finally { await browser.close(); }
