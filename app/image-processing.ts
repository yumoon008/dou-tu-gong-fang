export type RgbaImage = {
  width: number;
  height: number;
  data: ArrayLike<number>;
};

export const srgbByteToLinear = (value: number) => {
  const normalized = value / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : Math.pow((normalized + 0.055) / 1.055, 2.4);
};

export const linearToSrgbByte = (value: number) => {
  const normalized = value <= 0.0031308
    ? value * 12.92
    : 1.055 * Math.pow(value, 1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(normalized * 255)));
};

/**
 * Reduces an evenly sampled square RGBA image in linear light. The browser
 * supplies the high-resolution crop; this function performs the color-safe
 * averaging shared by the product and its regression tests.
 */
export function downsampleLinearLight(
  source: RgbaImage,
  targetSize: number,
  sampleFactor: number,
): RgbaImage {
  const expectedSize = targetSize * sampleFactor;
  if (source.width !== expectedSize || source.height !== expectedSize) {
    throw new Error(
      `Expected ${expectedSize}×${expectedSize} source pixels, received ${source.width}×${source.height}.`,
    );
  }
  if (!Number.isInteger(targetSize) || targetSize <= 0 || !Number.isInteger(sampleFactor) || sampleFactor <= 0) {
    throw new Error("targetSize and sampleFactor must be positive integers.");
  }

  const output = new Uint8ClampedArray(targetSize * targetSize * 4);
  const sampleCount = sampleFactor * sampleFactor;
  for (let y = 0; y < targetSize; y++) {
    for (let x = 0; x < targetSize; x++) {
      let red = 0;
      let green = 0;
      let blue = 0;
      for (let offsetY = 0; offsetY < sampleFactor; offsetY++) {
        for (let offsetX = 0; offsetX < sampleFactor; offsetX++) {
          const sourceOffset = (
            (y * sampleFactor + offsetY) * source.width
            + x * sampleFactor
            + offsetX
          ) * 4;
          const alpha = source.data[sourceOffset + 3] / 255;
          // Canvas crops are composited onto white. Keeping that behavior here
          // also makes direct unit tests of transparent pixels deterministic.
          red += srgbByteToLinear(source.data[sourceOffset] * alpha + 255 * (1 - alpha));
          green += srgbByteToLinear(source.data[sourceOffset + 1] * alpha + 255 * (1 - alpha));
          blue += srgbByteToLinear(source.data[sourceOffset + 2] * alpha + 255 * (1 - alpha));
        }
      }
      const outputOffset = (y * targetSize + x) * 4;
      output[outputOffset] = linearToSrgbByte(red / sampleCount);
      output[outputOffset + 1] = linearToSrgbByte(green / sampleCount);
      output[outputOffset + 2] = linearToSrgbByte(blue / sampleCount);
      output[outputOffset + 3] = 255;
    }
  }

  return { width: targetSize, height: targetSize, data: output };
}
