import { Hono } from 'hono';
import { html } from 'hono/html';

type Bindings = {
  MICROCMS_SERVICE_DOMAIN?: string;
  MICROCMS_API_KEY?: string;
  MICROCMS_ENDPOINT?: string;
};
type Lesson = { id: string; title: string; description: string };
const demo: Lesson[] = [
  { id: 'b', title: '子音 b の練習', description: '唇を閉じてから開き、声を出します。例：book / ball / bird' },
  { id: 'p', title: '子音 p の練習', description: '唇を閉じてから、息を出します。例：pen / pig / park' },
];

export const app = new Hono<{ Bindings: Bindings }>();
app.get('/api/health', (c) => c.json({ status: 'ok' }));

async function getLessons(env: Bindings): Promise<{ contents: Lesson[]; demo: boolean }> {
  const domain = env.MICROCMS_SERVICE_DOMAIN?.trim();
  const key = env.MICROCMS_API_KEY?.trim();
  if (!domain && !key) return { contents: demo, demo: true };
  if (!domain || !key || !/^[a-z0-9][a-z0-9-]*$/.test(domain)) throw new Error('Invalid CMS configuration');
  const endpoint = env.MICROCMS_ENDPOINT || 'lessons';
  if (!/^[a-zA-Z0-9_-]+$/.test(endpoint)) throw new Error('Invalid endpoint');
  const response = await fetch(`https://${domain}.microcms.io/api/v1/${endpoint}?limit=20&fields=id,title,description`, {
    headers: { 'X-MICROCMS-API-KEY': key },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error('CMS request failed');
  const data: unknown = await response.json();
  if (!data || typeof data !== 'object' || !('contents' in data) || !Array.isArray(data.contents)) throw new Error('Invalid CMS response');
  const contents = data.contents.map((item: unknown): Lesson => {
    if (!item || typeof item !== 'object' || !('id' in item) || typeof item.id !== 'string' || !('title' in item) || typeof item.title !== 'string') throw new Error('Invalid lesson');
    return { id: item.id, title: item.title, description: 'description' in item && typeof item.description === 'string' ? item.description : '' };
  });
  return { contents, demo: false };
}

app.get('/api/lessons', async (c) => {
  c.header('Cache-Control', 'no-store');
  try { return c.json(await getLessons(c.env)); }
  catch { return c.json({ error: '教材を取得できませんでした。microCMSの設定を確認してください。' }, 502); }
});

app.get('/api/fragments/lessons', async (c) => {
  c.header('Cache-Control', 'no-store');
  try {
    const result = await getLessons(c.env);
    return c.html(html`${result.demo ? html`<p class="notice">サンプル教材です。microCMS接続後は登録した教材を表示します。</p>` : ''}
      ${result.contents.length ? html`<div class="lesson-grid">${result.contents.map(lesson => html`<article class="lesson"><h3>${lesson.title}</h3><p>${lesson.description}</p></article>`)}</div>` : html`<p>教材はまだありません。</p>`}`);
  } catch {
    return c.html(html`<p role="alert">教材を取得できませんでした。時間をおいて再読み込みしてください。</p>`, 502);
  }
});
app.notFound(c => c.json({ error: 'Not found' }, 404));
export default app;
