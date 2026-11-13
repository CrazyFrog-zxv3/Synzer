import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    const filePath = path.resolve(root, `.${pathname}`);
    if (!filePath.startsWith(root + path.sep) && filePath !== root) throw new Error('Invalid path');
    const body = await readFile(filePath);
    response.writeHead(200, { 'content-type': mime[path.extname(filePath)] ?? 'application/octet-stream' });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end('Not found');
  }
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}`;
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto(`${baseUrl}/tests/browser/smoke.html`);
  await page.locator('#run').click();
  await page.locator('#status[data-status="pass"], #status[data-status="fail"]').waitFor({ timeout: 15000 });
  const harnessStatus = await page.locator('#status').getAttribute('data-status');
  const harnessDetails = await page.locator('#details').textContent();
  assert.equal(harnessStatus, 'pass', `Browser audio harness failed: ${await page.locator('#status').textContent()}\n${harnessDetails}`);

  await page.goto(`${baseUrl}/index.html`);
  const firstKey = page.locator('#keyboard .key').first();
  await firstKey.scrollIntoViewIfNeeded();
  const keyBox = await firstKey.boundingBox();
  await page.mouse.move(keyBox.x + keyBox.width / 2, keyBox.y + keyBox.height / 2);
  await page.mouse.down();
  await page.locator('#message').filter({ hasText: /Nota MIDI 60 ativa/ }).waitFor({ timeout: 15000 });
  assert.match(await page.locator('#state').textContent(), /ENGINE READY/);
  await page.mouse.up();
  assert.deepEqual(pageErrors, [], `Browser page errors: ${pageErrors.join('; ')}`);

  process.stdout.write(JSON.stringify({
    status: 'PASS',
    checks: [
      'AudioContext iniciado por interação real',
      'AudioWorklet carregado no Chromium',
      '12 vozes simultâneas produziram sinal mensurável no AnalyserNode',
      'AudioContext suspendeu, retomou e fechou corretamente',
      'Motor reinicializou após close sem reutilizar o contexto anterior',
      'Teclado da interface principal iniciou uma nota',
    ],
    audioHarness: JSON.parse(harnessDetails),
    pageErrors,
  }, null, 2) + '\n');
} finally {
  if (browser) await browser.close();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
