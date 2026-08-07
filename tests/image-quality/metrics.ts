export type RgbImage = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

export type QualityMetrics = {
  meanDeltaE: number;
  p95DeltaE: number;
  meanDeltaL: number;
  ssim: number;
  edgeCorrelation: number;
};

type Lab = [number, number, number];

const radians = (degrees: number) => degrees * Math.PI / 180;
const degrees = (value: number) => value * 180 / Math.PI;

export function rgbToLab(red: number, green: number, blue: number): Lab {
  const linear = (byte: number) => {
    const value = byte / 255;
    return value > 0.04045 ? Math.pow((value + 0.055) / 1.055, 2.4) : value / 12.92;
  };
  const r = linear(red), g = linear(green), b = linear(blue);
  let x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  let y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  let z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const transform = (value: number) => value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116;
  x = transform(x); y = transform(y); z = transform(z);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

export function deltaE2000(lab1: Lab, lab2: Lab) {
  const [l1, a1, b1] = lab1, [l2, a2, b2] = lab2;
  const c1 = Math.hypot(a1, b1), c2 = Math.hypot(a2, b2);
  const averageC = (c1 + c2) / 2;
  const g = 0.5 * (1 - Math.sqrt(Math.pow(averageC, 7) / (Math.pow(averageC, 7) + Math.pow(25, 7))));
  const a1p = (1 + g) * a1, a2p = (1 + g) * a2;
  const c1p = Math.hypot(a1p, b1), c2p = Math.hypot(a2p, b2);
  const hue = (a: number, b: number) => {
    const angle = degrees(Math.atan2(b, a));
    return angle >= 0 ? angle : angle + 360;
  };
  const h1p = hue(a1p, b1), h2p = hue(a2p, b2);
  const deltaL = l2 - l1, deltaC = c2p - c1p;
  let deltaHue = h2p - h1p;
  if (c1p * c2p === 0) deltaHue = 0;
  else if (deltaHue > 180) deltaHue -= 360;
  else if (deltaHue < -180) deltaHue += 360;
  const deltaH = 2 * Math.sqrt(c1p * c2p) * Math.sin(radians(deltaHue / 2));
  const averageL = (l1 + l2) / 2, averageCp = (c1p + c2p) / 2;
  let averageHue = h1p + h2p;
  if (c1p * c2p === 0) averageHue = h1p + h2p;
  else if (Math.abs(h1p - h2p) <= 180) averageHue /= 2;
  else if (averageHue < 360) averageHue = (averageHue + 360) / 2;
  else averageHue = (averageHue - 360) / 2;
  const t = 1 - 0.17 * Math.cos(radians(averageHue - 30))
    + 0.24 * Math.cos(radians(2 * averageHue))
    + 0.32 * Math.cos(radians(3 * averageHue + 6))
    - 0.20 * Math.cos(radians(4 * averageHue - 63));
  const deltaTheta = 30 * Math.exp(-Math.pow((averageHue - 275) / 25, 2));
  const rc = 2 * Math.sqrt(Math.pow(averageCp, 7) / (Math.pow(averageCp, 7) + Math.pow(25, 7)));
  const sl = 1 + 0.015 * Math.pow(averageL - 50, 2) / Math.sqrt(20 + Math.pow(averageL - 50, 2));
  const sc = 1 + 0.045 * averageCp, sh = 1 + 0.015 * averageCp * t;
  const rt = -Math.sin(radians(2 * deltaTheta)) * rc;
  const lTerm = deltaL / sl, cTerm = deltaC / sc, hTerm = deltaH / sh;
  return Math.sqrt(lTerm * lTerm + cTerm * cTerm + hTerm * hTerm + rt * cTerm * hTerm);
}

function blur3x3(image: RgbImage): RgbImage {
  const output = new Uint8ClampedArray(image.data.length);
  const kernel = [1, 2, 1, 2, 4, 2, 1, 2, 1];
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      for (let channel = 0; channel < 3; channel++) {
        let total = 0;
        let weight = 0;
        for (let offsetY = -1; offsetY <= 1; offsetY++) {
          for (let offsetX = -1; offsetX <= 1; offsetX++) {
            const sampleX = Math.max(0, Math.min(image.width - 1, x + offsetX));
            const sampleY = Math.max(0, Math.min(image.height - 1, y + offsetY));
            const kernelWeight = kernel[(offsetY + 1) * 3 + offsetX + 1];
            total += image.data[(sampleY * image.width + sampleX) * 4 + channel] * kernelWeight;
            weight += kernelWeight;
          }
        }
        output[(y * image.width + x) * 4 + channel] = Math.round(total / weight);
      }
      output[(y * image.width + x) * 4 + 3] = 255;
    }
  }
  return { ...image, data: output };
}

const localSsim = (source: number[], output: number[], width: number, height: number) => {
  const radius = 3;
  let total = 0;
  let windows = 0;
  for (let centerY = radius; centerY < height - radius; centerY += 2) {
    for (let centerX = radius; centerX < width - radius; centerX += 2) {
      let meanSource = 0, meanOutput = 0, count = 0;
      for (let y = centerY - radius; y <= centerY + radius; y++) {
        for (let x = centerX - radius; x <= centerX + radius; x++) {
          const index = y * width + x;
          meanSource += source[index]; meanOutput += output[index]; count++;
        }
      }
      meanSource /= count; meanOutput /= count;
      let varianceSource = 0, varianceOutput = 0, covariance = 0;
      for (let y = centerY - radius; y <= centerY + radius; y++) {
        for (let x = centerX - radius; x <= centerX + radius; x++) {
          const index = y * width + x;
          const sourceDelta = source[index] - meanSource;
          const outputDelta = output[index] - meanOutput;
          varianceSource += sourceDelta * sourceDelta;
          varianceOutput += outputDelta * outputDelta;
          covariance += sourceDelta * outputDelta;
        }
      }
      varianceSource /= count - 1; varianceOutput /= count - 1; covariance /= count - 1;
      total += ((2 * meanSource * meanOutput + 1) * (2 * covariance + 9))
        / ((meanSource * meanSource + meanOutput * meanOutput + 1) * (varianceSource + varianceOutput + 9));
      windows++;
    }
  }
  return total / windows;
};

const sobel = (values: number[], width: number, height: number) => {
  const output: number[] = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const at = (offsetX: number, offsetY: number) => values[(y + offsetY) * width + x + offsetX];
      const gx = -at(-1, -1) + at(1, -1) - 2 * at(-1, 0) + 2 * at(1, 0) - at(-1, 1) + at(1, 1);
      const gy = -at(-1, -1) - 2 * at(0, -1) - at(1, -1) + at(-1, 1) + 2 * at(0, 1) + at(1, 1);
      output.push(Math.hypot(gx, gy));
    }
  }
  return output;
};

const correlation = (left: number[], right: number[]) => {
  const leftMean = left.reduce((sum, value) => sum + value, 0) / left.length;
  const rightMean = right.reduce((sum, value) => sum + value, 0) / right.length;
  let covariance = 0, leftVariance = 0, rightVariance = 0;
  for (let index = 0; index < left.length; index++) {
    const leftDelta = left[index] - leftMean;
    const rightDelta = right[index] - rightMean;
    covariance += leftDelta * rightDelta;
    leftVariance += leftDelta * leftDelta;
    rightVariance += rightDelta * rightDelta;
  }
  const denominator = Math.sqrt(leftVariance * rightVariance);
  return denominator === 0 ? (leftVariance === rightVariance ? 1 : 0) : covariance / denominator;
};

export function evaluateQuality(sourceInput: RgbImage, outputInput: RgbImage, soften: boolean) {
  if (sourceInput.width !== outputInput.width || sourceInput.height !== outputInput.height) {
    throw new Error("Quality images must have identical dimensions.");
  }
  const source = soften ? blur3x3(sourceInput) : sourceInput;
  const output = soften ? blur3x3(outputInput) : outputInput;
  const deltaValues: number[] = [];
  const sourceLightness: number[] = [];
  const outputLightness: number[] = [];
  let deltaLightness = 0;
  for (let offset = 0; offset < source.data.length; offset += 4) {
    const sourceLab = rgbToLab(source.data[offset], source.data[offset + 1], source.data[offset + 2]);
    const outputLab = rgbToLab(output.data[offset], output.data[offset + 1], output.data[offset + 2]);
    deltaValues.push(deltaE2000(sourceLab, outputLab));
    sourceLightness.push(sourceLab[0]); outputLightness.push(outputLab[0]);
    deltaLightness += outputLab[0] - sourceLab[0];
  }
  const sortedDelta = [...deltaValues].sort((a, b) => a - b);
  const metrics: QualityMetrics = {
    meanDeltaE: deltaValues.reduce((sum, value) => sum + value, 0) / deltaValues.length,
    p95DeltaE: sortedDelta[Math.min(sortedDelta.length - 1, Math.floor(sortedDelta.length * 0.95))],
    meanDeltaL: deltaLightness / deltaValues.length,
    ssim: localSsim(sourceLightness, outputLightness, source.width, source.height),
    edgeCorrelation: correlation(
      sobel(sourceLightness, source.width, source.height),
      sobel(outputLightness, output.width, output.height),
    ),
  };
  if (Object.values(metrics).some((value) => !Number.isFinite(value))) {
    throw new Error(`Non-finite quality metric: ${JSON.stringify(metrics)}`);
  }
  return { metrics, deltaValues };
}

export function compareMetrics(current: QualityMetrics, baseline: QualityMetrics) {
  const regressions: string[] = [];
  if (current.meanDeltaE > baseline.meanDeltaE * 1.05 + 0.25) regressions.push("meanDeltaE");
  if (current.p95DeltaE > baseline.p95DeltaE * 1.08 + 0.5) regressions.push("p95DeltaE");
  if (Math.abs(current.meanDeltaL) > Math.abs(baseline.meanDeltaL) + 1) regressions.push("meanDeltaL");
  if (current.ssim < baseline.ssim - 0.015) regressions.push("ssim");
  if (current.edgeCorrelation < baseline.edgeCorrelation - 0.03) regressions.push("edgeCorrelation");
  return regressions;
}
