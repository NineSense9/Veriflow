import { test, expect } from '@playwright/test';

test('draft needs a tested package and publishes an idempotent real problem', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('用户名', { exact: true }).fill('demo');
  await page.getByLabel('密码', { exact: true }).fill('demo');
  await page.locator('button[type=submit]').click();
  await expect(page).toHaveURL(/\/$/);
  const draft = await (await page.request.post('/api/compose', { data: { nl: '完整出题。', allow_ai: false } })).json();
  await page.goto(`/compose/${draft.id}`);
  await expect(page.getByRole('button', { name: '审题通过', exact: true })).toBeDisabled();
  await page.getByText('导入或查看题包', { exact: true }).click();
  await page.getByLabel('完整题包 JSON').fill(JSON.stringify({
    title: '输入回显', statement: '读取输入并原样输出。', input: '一个单词', output: '原单词',
    public_tests: [{ stdin: 'hi\n', stdout: 'hi\n' }], hidden_tests: [{ stdin: 'bye\n', stdout: 'bye\n' }],
    reference: { lang: 'python3', source: 'import sys\nprint(sys.stdin.read(), end="")' },
  }));
  await page.getByRole('button', { name: '校验并保存题包', exact: true }).click();
  await expect(page.getByText('参考解已通过 2 条测试', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '审题通过', exact: true }).click();
  const publishedResponse = page.waitForResponse(r => r.url().endsWith(`/api/compose/${draft.id}/publish`));
  await page.getByRole('button', { name: '入库', exact: true }).click();
  const published = await (await publishedResponse).json();
  const id = published.published_problem_id;
  expect(id).toBeTruthy();
  await page.reload();
  await expect(page.getByText(`已发布为 ${id}`, { exact: false })).toBeVisible();
  const repeated = await (await page.request.post(`/api/compose/${draft.id}/publish`)).json();
  expect(repeated.published_problem_id).toBe(id);
  const result = await (await page.request.post(`/api/problems/${id}/submit`, { data: { lang: 'python3', source: 'raise RuntimeError()' } })).json();
  expect(result.verdict).toBe('RE');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
