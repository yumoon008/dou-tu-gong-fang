import { appendFile, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";
import { createServer } from "vite";
import { mardPalette } from "../../app/palettes";
import { compareMetrics, evaluateQuality, type QualityMetrics, type RgbImage } from "./metrics";

const sharp = createRequire(import.meta.url)("sharp") as typeof import("sharp");

type RenderStyle = "clear" | "soft";
type BoardSize = 52 | 104;
type QualityCase = {
  id: string;
  fixture: string;
  size: BoardSize;
  style: RenderStyle;
  metrics: QualityMetrics;
  baseline?: QualityMetrics;
  regressions: string[];
};
type Baseline = { version: 1; generatedAt: string; cases: Record<string, QualityMetrics> };

const testRoot = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testRoot, "../..");
const fixtureRoot = path.join(testRoot, "fixtures");
const reportRoot = path.join(projectRoot, "artifacts/image-quality");
const baselinePath = path.join(testRoot, "quality-baseline.json");
const updateBaseline = process.argv.includes("--update-baseline");

const fixtures = [
  "synthetic-color.png",
  "synthetic-detail.png",
  "portrait.jpg",
  "pet.webp",
  "landscape.png",
  "still-life.png",
];
const configurations: Array<{ size: BoardSize; style: RenderStyle }> = [
  { size: 52, style: "clear" },
  { size: 52, style: "soft" },
  { size: 104, style: "clear" },
  { size: 104, style: "soft" },
];
const paletteRgb = new Set(mardPalette.map((color) => color.rgb.join(",")));

const roundMetrics = (metrics: QualityMetrics): QualityMetrics => Object.fromEntries(
  Object.entries(metrics).map(([key, value]) => [key, Number(value.toFixed(6))]),
) as QualityMetrics;

async function captureCase(page: Page, baseUrl: string, fixturePath: string, size: BoardSize, style: RenderStyle) {
  await page.goto(`${baseUrl}/dou-tu-gong-fang/`, { waitUntil: "networkidle" });
  await page.locator('input[type="file"]').setInputFiles(fixturePath);
  await page.locator(".crop-section").waitFor({ state: "visible" });
  await page.locator(".board-choices button", { hasText: `${size} × ${size}` }).click();
  await page.locator(".style-choices button", { hasText: style === "clear" ? "清晰模式" : "柔和模式" }).click();
  await page.getByRole("button", { name: "生成拼豆图纸" }).click();
  await page.locator(".result-section").waitFor({ state: "visible" });

  return page.evaluate(({ boardSize }) => {
    const image = document.querySelector<HTMLImageElement>(".upload-card img");
    const resultCanvas = document.querySelector<HTMLCanvasElement>(".canvas-wrap canvas");
    const totalText = document.querySelector<HTMLElement>(".totals b")?.textContent ?? "";
    if (!image || !resultCanvas) throw new Error("Missing uploaded image or result canvas.");

    const sampleFactor = 8;
    const sampleSize = boardSize * sampleFactor;
    const sampleCanvas = document.createElement("canvas");
    sampleCanvas.width = sampleSize; sampleCanvas.height = sampleSize;
    const sampleContext = sampleCanvas.getContext("2d", { willReadFrequently: true, colorSpace: "srgb" });
    if (!sampleContext) throw new Error("Could not create reference canvas.");
    sampleContext.fillStyle = "white";
    sampleContext.fillRect(0, 0, sampleSize, sampleSize);
    sampleContext.imageSmoothingEnabled = true;
    sampleContext.imageSmoothingQuality = "high";
    const scale = Math.max(sampleSize / image.naturalWidth, sampleSize / image.naturalHeight);
    const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
    sampleContext.drawImage(image, (sampleSize - width) / 2, (sampleSize - height) / 2, width, height);
    const sampled = sampleContext.getImageData(0, 0, sampleSize, sampleSize);
    const source = new Uint8ClampedArray(boardSize * boardSize * 4);
    const toLinear = (byte: number) => {
      const value = byte / 255;
      return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
    };
    const toSrgb = (value: number) => {
      const encoded = value <= 0.0031308 ? value * 12.92 : 1.055 * Math.pow(value, 1 / 2.4) - 0.055;
      return Math.max(0, Math.min(255, Math.round(encoded * 255)));
    };
    for (let y = 0; y < boardSize; y++) {
      for (let x = 0; x < boardSize; x++) {
        let red = 0, green = 0, blue = 0;
        for (let offsetY = 0; offsetY < sampleFactor; offsetY++) {
          for (let offsetX = 0; offsetX < sampleFactor; offsetX++) {
            const offset = ((y * sampleFactor + offsetY) * sampleSize + x * sampleFactor + offsetX) * 4;
            red += toLinear(sampled.data[offset]);
            green += toLinear(sampled.data[offset + 1]);
            blue += toLinear(sampled.data[offset + 2]);
          }
        }
        const count = sampleFactor * sampleFactor;
        const target = (y * boardSize + x) * 4;
        source[target] = toSrgb(red / count);
        source[target + 1] = toSrgb(green / count);
        source[target + 2] = toSrgb(blue / count);
        source[target + 3] = 255;
      }
    }

    const resultContext = resultCanvas.getContext("2d", { willReadFrequently: true });
    if (!resultContext) throw new Error("Could not read result canvas.");
    const rendered = resultContext.getImageData(0, 0, resultCanvas.width, resultCanvas.height);
    const output = new Uint8ClampedArray(boardSize * boardSize * 4);
    for (let y = 0; y < boardSize; y++) {
      for (let x = 0; x < boardSize; x++) {
        const sourceX = Math.min(resultCanvas.width - 1, Math.floor((x + 0.5) * resultCanvas.width / boardSize));
        const sourceY = Math.min(resultCanvas.height - 1, Math.floor((y + 0.5) * resultCanvas.height / boardSize));
        const renderedOffset = (sourceY * resultCanvas.width + sourceX) * 4;
        const target = (y * boardSize + x) * 4;
        output[target] = rendered.data[renderedOffset];
        output[target + 1] = rendered.data[renderedOffset + 1];
        output[target + 2] = rendered.data[renderedOffset + 2];
        output[target + 3] = 255;
      }
    }
    return {
      source: Array.from(source),
      output: Array.from(output),
      total: Number(totalText.replace(/\D/g, "")),
    };
  }, { boardSize: size });
}

const savePng = async (image: RgbImage, destination: string) => {
  await sharp(image.data, { raw: { width: image.width, height: image.height, channels: 4 } })
    .resize(416, 416, { kernel: "nearest" })
    .png()
    .toFile(destination);
};

const makeHeatmap = (deltaValues: number[], size: number): RgbImage => {
  const data = new Uint8ClampedArray(size * size * 4);
  deltaValues.forEach((delta, index) => {
    const normalized = Math.max(0, Math.min(1, delta / 20));
    data[index * 4] = Math.round(255 * normalized);
    data[index * 4 + 1] = Math.round(210 * (1 - normalized));
    data[index * 4 + 2] = Math.round(70 * (1 - normalized));
    data[index * 4 + 3] = 255;
  });
  return { width: size, height: size, data };
};

function reportHtml(cases: QualityCase[]) {
  const rows = cases.map((item) => {
    const status = item.regressions.length ? `回归：${item.regressions.join(", ")}` : "通过";
    const metric = (key: keyof QualityMetrics, digits: number) => {
      const current = item.metrics[key];
      const baseline = item.baseline?.[key];
      return `${current.toFixed(digits)}${baseline === undefined ? "" : `<small>基线 ${baseline.toFixed(digits)} · 变化 ${(current - baseline).toFixed(digits)}</small>`}`;
    };
    return `<article class="case ${item.regressions.length ? "bad" : "good"}">
      <h2>${item.id} <span>${status}</span></h2>
      <div class="images"><figure><img src="images/${item.id}-source.png"><figcaption>处理前</figcaption></figure><figure><img src="images/${item.id}-output.png"><figcaption>处理后</figcaption></figure><figure><img src="images/${item.id}-heatmap.png"><figcaption>色差热力图</figcaption></figure></div>
      <p><a href="inputs/${item.fixture}">查看原始上传图</a></p>
      <dl><dt>平均 ΔE00</dt><dd>${metric("meanDeltaE", 3)}</dd><dt>P95 ΔE00</dt><dd>${metric("p95DeltaE", 3)}</dd><dt>平均 ΔL*</dt><dd>${metric("meanDeltaL", 3)}</dd><dt>SSIM</dt><dd>${metric("ssim", 4)}</dd><dt>边缘相关度</dt><dd>${metric("edgeCorrelation", 4)}</dd></dl>
    </article>`;
  }).join("\n");
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>图片转换质量报告</title><style>
    body{font:14px system-ui;margin:0;background:#f5f2ed;color:#29251f}header{padding:32px;max-width:1120px;margin:auto}main{max-width:1120px;margin:auto;padding:0 32px 48px;display:grid;gap:20px}.case{background:white;border:1px solid #ded6ca;border-left:5px solid #4b8f76;border-radius:8px;padding:20px}.case.bad{border-left-color:#c4473b}h1,h2{margin-top:0}h2{display:flex;justify-content:space-between}h2 span{font-size:12px}.images{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.images img{width:100%;image-rendering:pixelated;border:1px solid #ddd}figure{margin:0}figcaption{text-align:center;color:#71685e;margin-top:5px}a{color:#996053}dl{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:0}dt{color:#756b61}dd{margin:0;font-weight:700}dd small{display:block;color:#82776d;font-weight:400;margin-top:3px}@media(max-width:700px){.images{grid-template-columns:1fr}dl{grid-template-columns:1fr 1fr}}
  </style><header><h1>图片转换质量回归报告</h1><p>${new Date().toISOString()} · ${cases.length} 个案例 · ${cases.filter((item) => item.regressions.length).length} 个回归</p></header><main>${rows}</main></html>`;
}

async function writeSummary(cases: QualityCase[]) {
  const regressions = cases.filter((item) => item.regressions.length);
  const lines = [
    "## 图片转换质量",
    "",
    `运行 ${cases.length} 个案例；${regressions.length ? `发现 **${regressions.length}** 个质量回归。` : "未发现质量回归。"}`,
    "",
    "| 案例 | 平均 ΔE00 | P95 ΔE00 | SSIM | 边缘相关度 | 结果 |",
    "|---|---:|---:|---:|---:|---|",
    ...cases.map((item) => `| ${item.id} | ${item.metrics.meanDeltaE.toFixed(3)} | ${item.metrics.p95DeltaE.toFixed(3)} | ${item.metrics.ssim.toFixed(4)} | ${item.metrics.edgeCorrelation.toFixed(4)} | ${item.regressions.length ? item.regressions.join(", ") : "通过"} |`),
    "",
  ];
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, lines.join("\n"));
  }
  regressions.forEach((item) => console.log(`::warning title=图片质量回归 ${item.id}::${item.regressions.join(", ")}`));
}

async function main() {
  await mkdir(path.join(reportRoot, "images"), { recursive: true });
  await mkdir(path.join(reportRoot, "inputs"), { recursive: true });
  await Promise.all(fixtures.map((fixture) => copyFile(
    path.join(fixtureRoot, fixture),
    path.join(reportRoot, "inputs", fixture),
  )));

  let baseline: Baseline | null = null;
  if (!updateBaseline) baseline = JSON.parse(await readFile(baselinePath, "utf8")) as Baseline;

  const vite = await createServer({
    configFile: path.join(projectRoot, "vite.pages.config.ts"),
    server: { host: "127.0.0.1", port: 4173, strictPort: false },
    logLevel: "error",
  });
  await vite.listen();
  const port = vite.httpServer?.address();
  if (!port || typeof port === "string") throw new Error("Could not determine Vite test port.");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1000, height: 900 }, deviceScaleFactor: 1 });
  // tsx/esbuild annotates functions passed to page.evaluate with this helper.
  await page.addInitScript({ content: "globalThis.__name = (target) => target;" });
  const cases: QualityCase[] = [];
  let activeCase = "startup";
  try {
    for (const fixture of fixtures) {
      for (const configuration of configurations) {
        const id = `${path.parse(fixture).name}-${configuration.size}-${configuration.style}`;
        activeCase = id;
        const captured = await captureCase(page, `http://127.0.0.1:${port.port}`, path.join(fixtureRoot, fixture), configuration.size, configuration.style);
        if (captured.total !== configuration.size * configuration.size) {
          throw new Error(`${id} reported ${captured.total} beads instead of ${configuration.size * configuration.size}.`);
        }
        const source: RgbImage = { width: configuration.size, height: configuration.size, data: Uint8ClampedArray.from(captured.source) };
        const output: RgbImage = { width: configuration.size, height: configuration.size, data: Uint8ClampedArray.from(captured.output) };
        for (let offset = 0; offset < output.data.length; offset += 4) {
          const key = `${output.data[offset]},${output.data[offset + 1]},${output.data[offset + 2]}`;
          if (!paletteRgb.has(key)) throw new Error(`${id} rendered a non-palette color at pixel ${offset / 4}: ${key}.`);
        }
        const { metrics, deltaValues } = evaluateQuality(source, output, configuration.style === "soft");
        const rounded = roundMetrics(metrics);
        const baselineMetrics = baseline?.cases[id];
        if (baseline && !baselineMetrics) throw new Error(`Baseline is missing case ${id}. Run test:image-quality:update intentionally.`);
        const regressions = baselineMetrics ? compareMetrics(rounded, baselineMetrics) : [];
        cases.push({ id, fixture, ...configuration, metrics: rounded, baseline: baselineMetrics, regressions });
        await Promise.all([
          savePng(source, path.join(reportRoot, "images", `${id}-source.png`)),
          savePng(output, path.join(reportRoot, "images", `${id}-output.png`)),
          savePng(makeHeatmap(deltaValues, configuration.size), path.join(reportRoot, "images", `${id}-heatmap.png`)),
        ]);
        console.log(`${regressions.length ? "REGRESSION" : "PASS"} ${id}`);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ""}` : String(error);
    await page.screenshot({ path: path.join(reportRoot, "failure.png"), fullPage: true }).catch(() => undefined);
    await writeFile(path.join(reportRoot, "failure.json"), `${JSON.stringify({ activeCase, message }, null, 2)}\n`);
    await writeFile(
      path.join(reportRoot, "index.html"),
      `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>图片质量测试失败</title><body><h1>图片质量测试失败</h1><p>案例：${activeCase}</p><pre>${message.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</pre><p>请查看 failure.png 和 failure.json。</p></body></html>`,
    );
    throw error;
  } finally {
    await browser.close();
    await vite.close();
  }

  if (updateBaseline) {
    const nextBaseline: Baseline = {
      version: 1,
      generatedAt: new Date().toISOString(),
      cases: Object.fromEntries(cases.map((item) => [item.id, item.metrics])),
    };
    await writeFile(baselinePath, `${JSON.stringify(nextBaseline, null, 2)}\n`);
  }
  await writeFile(path.join(reportRoot, "report.json"), `${JSON.stringify({ generatedAt: new Date().toISOString(), cases }, null, 2)}\n`);
  await writeFile(path.join(reportRoot, "index.html"), reportHtml(cases));
  await writeSummary(cases);
  const regressionCount = cases.filter((item) => item.regressions.length).length;
  console.log(`Quality report: ${path.join(reportRoot, "index.html")}`);
  if (regressionCount) process.exitCode = 1;
}

await main();
