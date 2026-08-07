import type { BoardSize, PaletteColor, PaletteId, RenderStyle } from "./palettes";

export type PatternUsage = { color: PaletteColor; count: number; percent: number };
export type PatternResult = {
  size: BoardSize;
  paletteId: PaletteId;
  style: RenderStyle;
  indices: Uint16Array;
  usage: PatternUsage[];
};

type Lab = [number, number, number];

const rgbToLab = ([r0, g0, b0]: [number, number, number]): Lab => {
  const linear = (value: number) => {
    const v = value / 255;
    return v > 0.04045 ? Math.pow((v + 0.055) / 1.055, 2.4) : v / 12.92;
  };
  const r = linear(r0), g = linear(g0), b = linear(b0);
  let x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  let y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  let z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (v: number) => v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116;
  x = f(x); y = f(y); z = f(z);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
};

const toRadians = (degrees: number) => degrees * Math.PI / 180;
const toDegrees = (radians: number) => radians * 180 / Math.PI;

// CIEDE2000 handles low-chroma colors and perceptual hue differences much
// better than a plain Euclidean distance in Lab (Delta E 76).
const deltaE2000 = (lab1: Lab, lab2: Lab) => {
  const [l1, a1, b1] = lab1, [l2, a2, b2] = lab2;
  const c1 = Math.hypot(a1, b1), c2 = Math.hypot(a2, b2);
  const avgC = (c1 + c2) / 2;
  const g = 0.5 * (1 - Math.sqrt(Math.pow(avgC, 7) / (Math.pow(avgC, 7) + Math.pow(25, 7))));
  const a1p = (1 + g) * a1, a2p = (1 + g) * a2;
  const c1p = Math.hypot(a1p, b1), c2p = Math.hypot(a2p, b2);
  const hue = (a: number, b: number) => {
    const angle = toDegrees(Math.atan2(b, a));
    return angle >= 0 ? angle : angle + 360;
  };
  const h1p = hue(a1p, b1), h2p = hue(a2p, b2);
  const dLp = l2 - l1, dCp = c2p - c1p;
  let dhp = h2p - h1p;
  if (c1p * c2p === 0) dhp = 0;
  else if (dhp > 180) dhp -= 360;
  else if (dhp < -180) dhp += 360;
  const dHp = 2 * Math.sqrt(c1p * c2p) * Math.sin(toRadians(dhp / 2));
  const avgLp = (l1 + l2) / 2, avgCp = (c1p + c2p) / 2;
  let avgHp = h1p + h2p;
  if (c1p * c2p === 0) avgHp = h1p + h2p;
  else if (Math.abs(h1p - h2p) <= 180) avgHp /= 2;
  else if (avgHp < 360) avgHp = (avgHp + 360) / 2;
  else avgHp = (avgHp - 360) / 2;
  const t = 1 - 0.17 * Math.cos(toRadians(avgHp - 30))
    + 0.24 * Math.cos(toRadians(2 * avgHp))
    + 0.32 * Math.cos(toRadians(3 * avgHp + 6))
    - 0.20 * Math.cos(toRadians(4 * avgHp - 63));
  const dTheta = 30 * Math.exp(-Math.pow((avgHp - 275) / 25, 2));
  const rc = 2 * Math.sqrt(Math.pow(avgCp, 7) / (Math.pow(avgCp, 7) + Math.pow(25, 7)));
  const sl = 1 + 0.015 * Math.pow(avgLp - 50, 2) / Math.sqrt(20 + Math.pow(avgLp - 50, 2));
  const sc = 1 + 0.045 * avgCp, sh = 1 + 0.015 * avgCp * t;
  const rt = -Math.sin(toRadians(2 * dTheta)) * rc;
  const lTerm = dLp / sl, cTerm = dCp / sc, hTerm = dHp / sh;
  return Math.sqrt(lTerm * lTerm + cTerm * cTerm + hTerm * hTerm + rt * cTerm * hTerm);
};

const nearest = (rgb: [number, number, number], labs: Lab[]) => {
  const source = rgbToLab(rgb);
  const sourceChroma = Math.hypot(source[1], source[2]);
  let best = 0, bestDistance = Infinity;
  for (let i = 0; i < labs.length; i++) {
    const target = labs[i];
    const targetChroma = Math.hypot(target[1], target[2]);
    let distance = deltaE2000(source, target);
    // Near-neutral fur, shadows and whites should stay neutral instead of
    // drifting toward a similarly bright green, blue or purple bead.
    if (sourceChroma < 14) {
      distance += Math.max(0, targetChroma - sourceChroma - 2) * 0.38;
    }
    // A small lightness anchor prevents a hue match from making the whole
    // pattern visibly darker than the source photograph.
    distance += Math.abs(source[0] - target[0]) * 0.12;
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
