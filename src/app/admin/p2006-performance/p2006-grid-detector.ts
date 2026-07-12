export type DetectedPerformanceGrid = {
  columnCenters: number[];
  rowCenters: number[];
  confidence: number;
  method: "pixel-lines" | "manual-box" | "layout-fallback";
  diagnostics: {
    verticalCandidates: number;
    horizontalCandidates: number;
    matchedColumns: number;
    matchedRows: number;
  };
};

type Peak = { position: number; strength: number };

type RegularRun = {
  positions: number[];
  confidence: number;
  matched: number;
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function mean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function coefficientOfVariation(values: number[]) {
  const average = mean(values);
  if (!average) return 1;
  const variance = mean(values.map((value) => (value - average) ** 2));
  return Math.sqrt(variance) / average;
}

function clusterScores(scores: number[], threshold: number, offset: number): Peak[] {
  const peaks: Peak[] = [];
  let start = -1;

  const closeCluster = (end: number) => {
    if (start < 0) return;
    let weightedPosition = 0;
    let totalStrength = 0;
    let maximum = 0;

    for (let index = start; index <= end; index += 1) {
      const strength = scores[index];
      weightedPosition += (index + offset) * strength;
      totalStrength += strength;
      maximum = Math.max(maximum, strength);
    }

    if (totalStrength > 0) {
      peaks.push({
        position: weightedPosition / totalStrength,
        strength: maximum,
      });
    }
    start = -1;
  };

  for (let index = 0; index < scores.length; index += 1) {
    if (scores[index] >= threshold) {
      if (start < 0) start = index;
    } else if (start >= 0) {
      closeCluster(index - 1);
    }
  }
  closeCluster(scores.length - 1);

  return peaks;
}

function selectRegularRun(
  peaks: Peak[],
  count: number,
  minimumGap: number,
  maximumGap: number,
  preferRight = false
): RegularRun | null {
  if (peaks.length < count) return null;

  const maximumStrength = Math.max(...peaks.map((peak) => peak.strength), 1);
  let best: { score: number; run: RegularRun } | null = null;

  for (let start = 0; start <= peaks.length - count; start += 1) {
    const slice = peaks.slice(start, start + count);
    const positions = slice.map((peak) => peak.position);
    const gaps = positions.slice(1).map((position, index) => position - positions[index]);
    const averageGap = mean(gaps);
    if (averageGap < minimumGap || averageGap > maximumGap) continue;

    const variation = coefficientOfVariation(gaps);
    const strength = mean(slice.map((peak) => peak.strength / maximumStrength));
    const rightBias = preferRight ? positions[positions.length - 1] / 10000 : 0;
    const score = strength * 0.65 + clamp01(1 - variation * 6) * 0.35 + rightBias;

    if (!best || score > best.score) {
      best = {
        score,
        run: {
          positions,
          confidence: clamp01(strength * 0.55 + (1 - variation * 5) * 0.45),
          matched: count,
        },
      };
    }
  }

  return best?.run ?? null;
}

function projectionScores(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  bounds: { left: number; right: number; top: number; bottom: number },
  orientation: "horizontal" | "vertical"
) {
  const left = Math.max(0, Math.floor(bounds.left));
  const right = Math.min(width - 1, Math.ceil(bounds.right));
  const top = Math.max(0, Math.floor(bounds.top));
  const bottom = Math.min(height - 1, Math.ceil(bounds.bottom));
  const length = orientation === "horizontal" ? bottom - top + 1 : right - left + 1;
  const scores = new Array<number>(Math.max(0, length)).fill(0);

  const isDark = (x: number, y: number) => {
    const offset = (y * width + x) * 4;
    const luminance =
      data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114;
    return luminance < 115 && data[offset + 3] > 100;
  };

  if (orientation === "horizontal") {
    for (let y = top; y <= bottom; y += 1) {
      let score = 0;
      for (let x = left; x <= right; x += 1) {
        if (isDark(x, y)) score += 1;
      }
      scores[y - top] = score;
    }
  } else {
    for (let x = left; x <= right; x += 1) {
      let score = 0;
      for (let y = top; y <= bottom; y += 1) {
        if (isDark(x, y)) score += 1;
      }
      scores[x - left] = score;
    }
  }

  return { scores, offset: orientation === "horizontal" ? top : left };
}

function centersFromBoundaries(boundaries: number[]) {
  return boundaries.slice(0, -1).map((value, index) => (value + boundaries[index + 1]) / 2);
}

function fallbackGrid(): DetectedPerformanceGrid {
  const left = 0.445;
  const right = 0.918;
  const top = 0.316;
  const bottom = 0.879;
  const columnWidth = (right - left) / 5;
  const rowHeight = (bottom - top) / 22;

  return {
    columnCenters: Array.from({ length: 5 }, (_, index) => left + columnWidth * (index + 0.5)),
    rowCenters: Array.from({ length: 22 }, (_, index) => top + rowHeight * (index + 0.5)),
    confidence: 0.25,
    method: "layout-fallback",
    diagnostics: {
      verticalCandidates: 0,
      horizontalCandidates: 0,
      matchedColumns: 0,
      matchedRows: 0,
    },
  };
}

export function gridFromManualBox(rect: {
  x: number;
  y: number;
  width: number;
  height: number;
}): DetectedPerformanceGrid {
  return {
    columnCenters: Array.from(
      { length: 5 },
      (_, index) => rect.x + (rect.width * (index + 0.5)) / 5
    ),
    rowCenters: Array.from(
      { length: 22 },
      (_, index) => rect.y + (rect.height * (index + 0.5)) / 22
    ),
    confidence: 0.55,
    method: "manual-box",
    diagnostics: {
      verticalCandidates: 6,
      horizontalCandidates: 23,
      matchedColumns: 5,
      matchedRows: 22,
    },
  };
}

export function detectPerformanceGrid(
  image: HTMLImageElement
): DetectedPerformanceGrid {
  const naturalWidth = image.naturalWidth;
  const naturalHeight = image.naturalHeight;
  if (!naturalWidth || !naturalHeight) return fallbackGrid();

  const scale = Math.min(1, 1500 / naturalWidth);
  const width = Math.max(1, Math.round(naturalWidth * scale));
  const height = Math.max(1, Math.round(naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return fallbackGrid();

  context.drawImage(image, 0, 0, width, height);
  const data = context.getImageData(0, 0, width, height).data;

  const horizontalBounds = {
    left: width * 0.40,
    right: width * 0.95,
    top: height * 0.24,
    bottom: height * 0.92,
  };
  const horizontalProjection = projectionScores(
    data,
    width,
    height,
    horizontalBounds,
    "horizontal"
  );
  const horizontalMaximum = Math.max(...horizontalProjection.scores, 1);
  const horizontalPeaks = clusterScores(
    horizontalProjection.scores,
    horizontalMaximum * 0.42,
    horizontalProjection.offset
  ).filter(
    (peak) => peak.position > height * 0.27 && peak.position < height * 0.92
  );

  const horizontalRun = selectRegularRun(
    horizontalPeaks,
    23,
    height * 0.008,
    height * 0.045
  );

  const verticalBounds = {
    left: width * 0.38,
    right: width * 0.97,
    top: horizontalRun?.positions[0] ?? height * 0.30,
    bottom: horizontalRun?.positions[22] ?? height * 0.89,
  };
  const verticalProjection = projectionScores(
    data,
    width,
    height,
    verticalBounds,
    "vertical"
  );
  const verticalMaximum = Math.max(...verticalProjection.scores, 1);
  const verticalPeaks = clusterScores(
    verticalProjection.scores,
    verticalMaximum * 0.44,
    verticalProjection.offset
  ).filter(
    (peak) => peak.position > width * 0.38 && peak.position < width * 0.97
  );

  const verticalRun = selectRegularRun(
    verticalPeaks,
    6,
    width * 0.035,
    width * 0.16,
    true
  );

  if (!horizontalRun || !verticalRun) {
    const fallback = fallbackGrid();
    return {
      ...fallback,
      diagnostics: {
        verticalCandidates: verticalPeaks.length,
        horizontalCandidates: horizontalPeaks.length,
        matchedColumns: verticalRun?.matched ? verticalRun.matched - 1 : 0,
        matchedRows: horizontalRun?.matched ? horizontalRun.matched - 1 : 0,
      },
    };
  }

  const columnCenters = centersFromBoundaries(verticalRun.positions).map(
    (position) => position / width
  );
  const rowCenters = centersFromBoundaries(horizontalRun.positions).map(
    (position) => position / height
  );
  const confidence = clamp01(
    verticalRun.confidence * 0.45 + horizontalRun.confidence * 0.55
  );

  return {
    columnCenters,
    rowCenters,
    confidence,
    method: "pixel-lines",
    diagnostics: {
      verticalCandidates: verticalPeaks.length,
      horizontalCandidates: horizontalPeaks.length,
      matchedColumns: columnCenters.length,
      matchedRows: rowCenters.length,
    },
  };
}
