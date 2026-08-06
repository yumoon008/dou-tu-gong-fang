import type { BoardSize, PaletteColor, PaletteId, RenderStyle } from "./palettes";

export type PatternUsage = { color: PaletteColor; count: number; percent: number };
export type PatternResult = {
  size: BoardSize;
  paletteId: PaletteId;
  style: RenderStyle;
  indices: Uint16Array;
  usage: PatternUsage[];
};

const rgbToLab = ([r0, g0, b0]: [number, number, number]) => {
  const linear = (v: number) => ((v /= 255) > 0.04045 ? Math.pow((v + 0.055) / 1.055, 2.4) : v / 12.92);
  const r = linear(r0), g = linear(g0), b = linear(b0);
  let x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  let y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  let z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (v: number) => v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116;
  x = f(x); y = f(y); z = f(z);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
};

const nearest = (rgb: [number, number, number], labs: number[][]) => {
  const lab = rgbToLab(rgb);
  let best = 0, bestDistance = Infinity;
  for (let i = 0; i < labs.length; i++) {
    const dl = lab[0] - labs[i][0], da = lab[1] - labs[i][1], db = lab[2] - labs[i][2];
    const distance = dl * dl + da * da + db * db;
    if (distance < bestDistance) { best = i; bestDistance = distance; }
  }
  return best;
};

export function convertImage(data: ImageData, size: BoardSize, palette: PaletteColor[], paletteId: PaletteId, style: RenderStyle): PatternResult {
  const labs = palette.map((color) => rgbToLab(color.rgb));
  const work = new Float32Array(data.data.length);
  for (let i = 0; i < data.data.length; i += 4) {
    const alpha = data.data[i + 3] / 255;
    work[i] = data.data[i] * alpha + 255 * (1 - alpha);
    work[i + 1] = data.data[i + 1] * alpha + 255 * (1 - alpha);
    work[i + 2] = data.data[i + 2] * alpha + 255 * (1 - alpha);
    work[i + 3] = 255;
  }
  const indices = new Uint16Array(size * size);
  const counts = new Uint32Array(palette.length);
  const spread = (x: number, y: number, error: number[], weight: number) => {
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const p = (y * size + x) * 4;
    for (let c = 0; c < 3; c++) work[p + c] = Math.max(0, Math.min(255, work[p + c] + error[c] * weight));
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const p = (y * size + x) * 4;
    const rgb: [number, number, number] = [work[p], work[p + 1], work[p + 2]];
    const index = nearest(rgb, labs);
    indices[y * size + x] = index;
    counts[index]++;
    if (style === "soft") {
      const chosen = palette[index].rgb;
      const error = [rgb[0] - chosen[0], rgb[1] - chosen[1], rgb[2] - chosen[2]];
      spread(x + 1, y, error, 7 / 16); spread(x - 1, y + 1, error, 3 / 16);
      spread(x, y + 1, error, 5 / 16); spread(x + 1, y + 1, error, 1 / 16);
    }
  }
  const total = size * size;
  const usage = palette.map((color, i) => ({ color, count: counts[i], percent: counts[i] / total * 100 }))
    .filter((item) => item.count > 0).sort((a, b) => b.count - a.count);
  return { size, paletteId, style, indices, usage };
}
