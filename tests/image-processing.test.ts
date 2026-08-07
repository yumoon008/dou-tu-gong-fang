import assert from "node:assert/strict";
import test from "node:test";
import { convertImage } from "../app/conversion";
import { downsampleLinearLight } from "../app/image-processing";
import { mardPalette } from "../app/palettes";
import { deltaE2000, evaluateQuality } from "./image-quality/metrics";

test("quality metrics match a published CIEDE2000 reference and identical images", () => {
  const referenceDelta = deltaE2000([50, 2.6772, -79.7751], [50, 0, -82.7485]);
  assert.ok(Math.abs(referenceDelta - 2.0425) < 0.0001);

  const data = new Uint8ClampedArray(8 * 8 * 4);
  for (let offset = 0; offset < data.length; offset += 4) {
    data[offset] = 120; data[offset + 1] = 140; data[offset + 2] = 160; data[offset + 3] = 255;
  }
  const image = { width: 8, height: 8, data };
  const { metrics } = evaluateQuality(image, image, false);
  assert.equal(metrics.meanDeltaE, 0);
  assert.equal(metrics.meanDeltaL, 0);
  assert.ok(Math.abs(metrics.ssim - 1) < Number.EPSILON);
  assert.equal(metrics.edgeCorrelation, 1);
});

test("every Mard palette color maps back to its own color in clear mode", () => {
  const source = { width: 52, height: 52, data: new Uint8ClampedArray(52 * 52 * 4) };
  for (let index = 0; index < mardPalette.length; index++) {
    const [red, green, blue] = mardPalette[index].rgb;
    const offset = index * 4;
    source.data[offset] = red; source.data[offset + 1] = green; source.data[offset + 2] = blue; source.data[offset + 3] = 255;
  }
  const fallback = mardPalette[0].rgb;
  for (let index = mardPalette.length; index < 52 * 52; index++) {
    const offset = index * 4;
    source.data[offset] = fallback[0]; source.data[offset + 1] = fallback[1]; source.data[offset + 2] = fallback[2]; source.data[offset + 3] = 255;
  }
  const result = convertImage(source, 52, mardPalette, "mard", "clear");
  for (let index = 0; index < mardPalette.length; index++) {
    assert.equal(result.indices[index], index, `${mardPalette[index].code} should round-trip`);
  }
  assert.equal(result.usage.reduce((sum, item) => sum + item.count, 0), 52 * 52);
});

test("linear downsampling composites transparency onto white", () => {
  const source = { width: 8, height: 8, data: new Uint8ClampedArray(8 * 8 * 4) };
  const result = downsampleLinearLight(source, 1, 8);
  assert.deepEqual(Array.from(result.data), [255, 255, 255, 255]);
});

test("neutral inputs stay near neutral and both board sizes keep exact totals", () => {
  for (const size of [52, 104] as const) {
    const source = { width: size, height: size, data: new Uint8ClampedArray(size * size * 4) };
    for (let offset = 0; offset < source.data.length; offset += 4) {
      source.data[offset] = 128; source.data[offset + 1] = 128; source.data[offset + 2] = 128; source.data[offset + 3] = 255;
    }
    for (const style of ["clear", "soft"] as const) {
      const result = convertImage(source, size, mardPalette, "mard", style);
      assert.equal(result.usage.reduce((sum, item) => sum + item.count, 0), size * size);
      const average = [0, 1, 2].map((channel) => result.usage.reduce(
        (sum, item) => sum + item.color.rgb[channel] * item.count,
        0,
      ) / (size * size));
      assert.ok(Math.max(...average) - Math.min(...average) <= 10, `${style} introduced a neutral color cast: ${average.join(",")}`);
    }
  }
});
