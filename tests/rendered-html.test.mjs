import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Dou Tu pattern studio", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html[^>]*lang=["']zh-CN["']/i);
  assert.match(html, /<title>豆图工房 · 把照片变成拼豆图纸<\/title>/i);
  assert.match(html, /把喜欢的画面/);
  assert.match(html, /Mard 221/);
  assert.match(html, /图片仅在你的浏览器中处理/);
  assert.match(html, /aria-label=["']上传图片["']/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
});

test("keeps the Sites and GitHub Pages entrypoints isolated", async () => {
  const [page, layout, staticEntry, pagesConfig, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../github-pages/main.tsx", import.meta.url), "utf8"),
    readFile(new URL("../vite.pages.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /import PatternStudio from "\.\/PatternStudio"/);
  assert.match(page, /<PatternStudio \/>/);
  assert.match(layout, /title:\s*"豆图工房 · 拼豆色号图生成器"/);
  assert.match(staticEntry, /import PatternStudio from "\.\.\/app\/PatternStudio"/);
  assert.match(pagesConfig, /root:\s*"github-pages"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);

  await assert.rejects(access(new URL("app/_sites-preview/SkeletonPreview.tsx", projectRoot)));
  await assert.rejects(access(new URL("pages/main.tsx", projectRoot)));
});
