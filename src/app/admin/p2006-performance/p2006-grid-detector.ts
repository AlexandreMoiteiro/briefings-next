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
type BoundaryFit = {
  boundaries: number[];
  confidence: number;
  matched: number;
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function mean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
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

function nearestPeak(peaks: Peak[], target: number, tolerance: number) {
  let best: Peak | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const peak of peaks) {
    const distance = Math.abs(peak.position - target);
    if (distance <= tolerance && distance < bestDistance) {
      best = peak;
      bestDistance = distance;
    }
  }

  return best ? { peak: best, distance: bestDistance } : null;
}

function fitRegularBoundaries(
  peaks: Peak[],
  count: number,
  minimumGap: number,
  maximumGap: number,
  expectedCentre: number,
  expectedSpan: number
): BoundaryFit | null {
  if (peaks.length < 2) return null;

  const maximumStrength = Math.max(...peaks.map((peak) => peak.strength), 1);
  let best: { score: number; fit: BoundaryFit } | null = null;

  for (let firstIndex = 0; firstIndex < peaks.length - 1; firstIndex += 1) {
    for (let lastIndex = firstIndex + 1; lastIndex < peaks.length; lastIndex += 1) {
      const first = peaks[firstIndex].position;
      const last = peaks[lastIndex].position;
      const gap = (last - first) / (count - 1);
      if (gap < minimumGap || gap > maximumGap) continue;

      const boundaries = Array.from(
        { length: count },
        (_, index) => first + gap * index
      );
      const tolerance = Math.max(2.5, gap * 0.22);
      const matches = boundaries.map((target) => nearestPeak(peaks, target, tolerance));
      const matched = matches.filter(Boolean).length;
      const matchRatio = matched / count;
      if (matchRatio < 0.7) continue;

      const matchedStrengths = matches
        .filter((match): match is NonNullable<typeof match> => Boolean(match))
        .map((match) => match.peak.strength / maximumStrength);
      const matchedOffsets = matches
        .filter((match): match is NonNullable<typeof match> => Boolean(match))
        .map((match) => match.distance / tolerance);

      const strengthScore = mean(matchedStrengths);
      const alignmentScore = clamp01(1 - mean(matchedOffsets));
      const centre = (first + last) / 2;
      const centreScore = clamp01(1 - Math.abs(centre - expectedCentre) / expectedSpan);
      const spanScore = clamp01(1 - Math.abs(last - first - expectedSpan) / expectedSpan);
      const score =
        matchRatio * 0.46 +
        strengthScore * 0.2 +
        alignmentScore * 0.18 +
        centreScore * 0.09 +
        spanScore * 0.07;

      if (!best || score > best.score) {
        best = {
          score,
          fit: {
            boundaries,
            confidence: clamp01(score),
            matched,
          },
        };
      }
    }
  }

  return best?.fit ?? null;
}

function continuousRunScores(
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
  const sampleLength = orientation === "horizontal" ? right - left + 1 : bottom - top + 1;
  const scoreLength = orientation === "horizontal" ? bottom - top + 1 : right - left + 1;
  const scores = new Array<number>(Math.max(0, scoreLength)).fill(0);

  const isDark = (x: number, y: number) => {
    const offset = (y * width + x) * 4;
    const luminance =
      data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114;
    return luminance < 185 && data[offset + 3] > 100;
  };

  const longestRun = (isMarked: (index: number) => boolean) => {
    let longest = 0;
    let current = 0;
    let pendingGap = 0;
    const allowedGap = 3;

    for (let index = 0; index < sampleLength; index += 1) {
      if (isMarked(index)) {
        current += pendingGap + 1;
        pendingGap = 0;
      } else if (current > 0 && pendingGap < allowedGap) {
        pendingGap += 1;
      } else {
        longest = Math.max(longest, current);
        current = 0;
        pendingGap = 0;
      }
    }

    return Math.max(longest, current) / Math.max(1, sampleLength);
  };

  if (orientation === "horizontal") {
    for (let y = top; y <= bottom; y += 1) {
      scores[y - top] = longestRun((index) => isDark(left + index, y));
    }
  } else {
    for (let x = left; x <= right; x += 1) {
      scores[x - left] = longestRun((index) => isDark(x, top + index));
    }
  }

  return { scores, offset: orientation === "horizontal" ? top : left };
}

function centresFromBoundaries(boundaries: number[]) {
  return boundaries
    .slice(0, -1)
    .map((value, index) => (value + boundaries[index + 1]) / 2);
}

function fallbackGrid(): DetectedPerformanceGrid {
  const left = 0.398;
  const right = 0.862;
  const top = 0.286;
  const bottom = 0.902;
  const columnWidth = (right - left) / 5;
  const rowHeight = (bottom - top) / 22;

  return {
    columnCenters: Array.from(
      { length: 5 },
      (_, index) => left + columnWidth * (index + 0.5)
    ),
    rowCenters: Array.from(
      { length: 22 },
      (_, index) => top + rowHeight * (index + 0.5)
    ),
    confidence: 0.2,
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

  const scale = Math.min(1, 1600 / naturalWidth);
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
    left: width * 0.37,
    right: width * 0.92,
    top: height * 0.23,
    bottom: height * 0.94,
  };
  const horizontalScores = continuousRunScores(
    data,
    width,
    height,
    horizontalBounds,
    "horizontal"
  );
  const horizontalPeaks = clusterScores(
    horizontalScores.scores,
    0.52,
    horizontalScores.offset
  ).filter(
    (peak) => peak.position > height * 0.25 && peak.position < height * 0.93
  );

  const horizontalFit = fitRegularBoundaries(
    horizontalPeaks,
    23,
    height * 0.009,
    height * 0.042,
    height * 0.595,
    height * 0.62
  );

  const firstRowBoundary = horizontalFit?.boundaries[0] ?? height * 0.286;
  const lastRowBoundary = horizontalFit?.boundaries[22] ?? height * 0.902;
  const verticalBounds = {
    left: width * 0.35,
    right: width * 0.94,
    top: firstRowBoundary,
    bottom: lastRowBoundary,
  };
  const verticalScores = continuousRunScores(
    data,
    width,
    height,
    verticalBounds,
    "vertical"
  );
  const verticalPeaks = clusterScores(
    verticalScores.scores,
    0.58,
    verticalScores.offset
  ).filter(
    (peak) => peak.position > width * 0.36 && peak.position < width * 0.93
  );

  const verticalFit = fitRegularBoundaries(
    verticalPeaks,
    6,
    width * 0.045,
    width * 0.13,
    width * 0.63,
    width * 0.47
  );

  if (!horizontalFit || !verticalFit) {
    const fallback = fallbackGrid();
    return {
      ...fallback,
      diagnostics: {
        verticalCandidates: verticalPeaks.length,
        horizontalCandidates: horizontalPeaks.length,
        matchedColumns: verticalFit ? verticalFit.matched - 1 : 0,
        matchedRows: horizontalFit ? horizontalFit.matched - 1 : 0,
      },
    };
  }

  const columnCenters = centresFromBoundaries(verticalFit.boundaries).map(
    (position) => position / width
  );
  const rowCenters = centresFromBoundaries(horizontalFit.boundaries).map(
    (position) => position / height
  );

  return {
    columnCenters,
    rowCenters,
    confidence: clamp01(
      verticalFit.confidence * 0.45 + horizontalFit.confidence * 0.55
    ),
    method: "pixel-lines",
    diagnostics: {
      verticalCandidates: verticalPeaks.length,
      horizontalCandidates: horizontalPeaks.length,
      matchedColumns: Math.max(0, verticalFit.matched - 1),
      matchedRows: Math.max(0, horizontalFit.matched - 1),
    },
  };
}
