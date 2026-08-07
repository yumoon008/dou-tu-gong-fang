import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { mardPalette } from "../../app/palettes";

const sharp = createRequire(import.meta.url)("sharp") as typeof import("sharp");

const size = 832;
const fixturesRoot = new URL("./fixtures/", import.meta.url);

const createCanvas = () => new Uint8ClampedArray(size * size * 4).fill(255);

const setPixel = (
  pixels: Uint8ClampedArray,
  x: number,
  y: number,
  red: number,
  green: number,
  blue: number,
  alpha = 255,
) => {
  if (x < 0 || x >= size || y < 0 || y >= size) return;
  const offset = (y * size + x) * 4;
  pixels[offset] = red;
  pixels[offset + 1] = green;
  pixels[offset + 2] = blue;
  pixels[offset + 3] = alpha;
};

const fillRect = (
  pixels: Uint8ClampedArray,
  left: number,
  top: number,
  width: number,
  height: number,
  color: [number, number, number, number?],
) => {
  for (let y = top; y < top + height; y++) {
    for (let x = left; x < left + width; x++) {
      setPixel(pixels, x, y, color[0], color[1], color[2], color[3] ?? 255);
    }
  }
};

async function createColorFixture() {
  const pixels = createCanvas();
  const swatchHeight = 48;
  const swatchAreaHeight = swatchHeight * 13;
  mardPalette.forEach((color, index) => {
    const column = index % 17;
    const row = Math.floor(index / 17);
    const left = Math.round(column * size / 17);
    const right = Math.round((column + 1) * size / 17);
    fillRect(pixels, left, row * swatchHeight, right - left, swatchHeight, color.rgb);
  });

  for (let y = swatchAreaHeight; y < 728; y++) {
    for (let x = 0; x < size; x++) {
      const gray = Math.round(x / (size - 1) * 255);
      setPixel(pixels, x, y, gray, gray, gray);
    }
  }

  const skinStops: Array<[number, number, number]> = [
    [76, 43, 32], [126, 75, 52], [177, 111, 77], [218, 158, 113], [249, 218, 186],
  ];
  for (let y = 728; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const position = x / (size - 1) * (skinStops.length - 1);
      const left = Math.floor(position);
      const right = Math.min(skinStops.length - 1, left + 1);
      const mix = position - left;
      const light = 0.78 + 0.32 * ((y - 728) / 103);
      const rgb = skinStops[left].map((value, channel) => Math.min(255, Math.round(
        (value * (1 - mix) + skinStops[right][channel] * mix) * light,
      ))) as [number, number, number];
      setPixel(pixels, x, y, rgb[0], rgb[1], rgb[2]);
    }
  }

  await sharp(pixels, { raw: { width: size, height: size, channels: 4 } })
    .png()
    .toFile(fileURLToPath(new URL("synthetic-color.png", fixturesRoot)));
}

async function createDetailFixture() {
  const pixels = createCanvas();

  for (let y = 0; y < size / 2; y++) {
    for (let x = 0; x < size / 2; x++) {
      const block = y < 208 ? 4 : 12;
      const dark = (Math.floor(x / block) + Math.floor(y / block)) % 2 === 0;
      const value = dark ? 24 : 236;
      setPixel(pixels, x, y, value, value, value);
    }
  }

  for (let line = -size; line < size; line += 18) {
    for (let x = 416; x < size; x++) {
      const y = Math.round((x - 416) * 0.72 + line);
      for (let thickness = 0; thickness < 4; thickness++) {
        setPixel(pixels, x, y + thickness, 31, 71, 126);
      }
    }
  }

  const circleCenters: Array<[number, number, number, [number, number, number, number]]> = [
    [110, 610, 82, [230, 64, 72, 255]],
    [258, 650, 120, [50, 146, 101, 190]],
    [430, 625, 95, [60, 112, 210, 130]],
    [650, 650, 150, [245, 184, 52, 80]],
  ];
  for (const [centerX, centerY, radius, color] of circleCenters) {
    for (let y = centerY - radius; y <= centerY + radius; y++) {
      for (let x = centerX - radius; x <= centerX + radius; x++) {
        const distance = Math.hypot(x - centerX, y - centerY);
        if (distance <= radius) {
          const edgeAlpha = Math.min(1, Math.max(0, radius - distance));
          setPixel(pixels, x, y, color[0], color[1], color[2], Math.round(color[3] * edgeAlpha));
        }
      }
    }
  }

  for (let x = 0; x < size; x++) {
    const wave = 780 + Math.round(Math.sin(x / 19) * 22);
    for (let thickness = -2; thickness <= 2; thickness++) {
      setPixel(pixels, x, wave + thickness, 32, 32, 32);
    }
  }

  await sharp(pixels, { raw: { width: size, height: size, channels: 4 } })
    .png()
    .toFile(fileURLToPath(new URL("synthetic-detail.png", fixturesRoot)));
}

await Promise.all([createColorFixture(), createDetailFixture()]);
