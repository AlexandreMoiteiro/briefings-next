export type NormalizedRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type GridDetectionOptions = {
  columns: number;
  rows: number;
  searchBounds?: NormalizedRect | null;
};

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

const DEFAULT_BOUNDS: NormalizedRect = {
  x: 0.28,
  y: 0.2,
  width: 0.66,
  height: 0.72,
};

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function normalizeBounds(bounds?: NormalizedRect | null): NormalizedRect {
  if (!bounds) return DEFAULT_BOUNDS;
  const x = clamp(bounds.x);
  const y = clamp(bounds.y);
  return {
    x,
    y,
    width: Math.max(0.03, Math.min(bounds.width, 1 - x)),
    height: Math.max(0.03, Math.min(bounds.height, 1 - y)),
  };
}

function mean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function clusterScores(scores: number[], threshold: number, offset: number): Peak[] {
  const peaks: Peak[] = [];
  let start = -1;

  const close = (end: number) => {
    if (start < 0) return;
    let weighted = 0;
    let total = 0;
    let strongest = 0;
    for (let index = start; index <= end; index += 1) {
      const strength = scores[index];
      weighted += (index + offset) * strength;
      total += strength;
      strongest = Math.max(strongest, strength);
    }
    if (total > 0) peaks.push({ position: weighted / total, strength: strongest });
    start = -1;
  };

  scores.forEach((score, index) => {
    if (score >= threshold) {
      if (start < 0) start = index;
    } else if (start >= 0) {
      close(index - 1);
    }
  });
  close(scores.length - 1);
  return peaks;
}

function nearestPeak(peaks: Peak[], target: number, tolerance: number) {
  let best: { peak: Peak; distance: number } | null = null;
  for (const peak of peaks) {
    const distance = Math.abs(peak.position - target);
    if (distance > tolerance) continue;
    if (!best || distance < best.distance) best = { peak, distance };
  }
  return best;
}

function fitRegularBoundaries(
  peaks: Peak[],
  boundaryCount: number,
  regionStart: number,
  regionEnd: number
): BoundaryFit | null {
  if (peaks.length < 2 || boundaryCount < 2) return null;
  const span = regionEnd - regionStart;
  const expectedGap = span / Math.max(1, boundaryCount - 1);
  const minimumGap = expectedGap * 0.45;
  const maximumGap = expectedGap * 1.8;
  const maximumStrength = Math.max(1, ...peaks.map((peak) => peak.strength));
  let best: { score: number; fit: BoundaryFit } | null = null;

  for (let firstIndex = 0; firstIndex < peaks.length - 1; firstIndex += 1) {
    for (let lastIndex = firstIndex + 1; lastIndex < peaks.length; lastIndex += 1) {
      const first = peaks[firstIndex].position;
      const last = peaks[lastIndex].position;
      const gap = (last - first) / (boundaryCount - 1);
      if (gap < minimumGap || gap > maximumGap) continue;

      const boundaries = Array.from(
        { length: boundaryCount },
        (_, index) => first + gap * index
      );
      const tolerance = Math.max(2.5, gap * 0.3);
      const matches = boundaries.map((target) => nearestPeak(peaks, target, tolerance));
      const matched = matches.filter(Boolean).length;
      const matchRatio = matched / boundaryCount;
      if (matchRatio < 0.55) continue;

      const alignment = mean(
        matches
          .filter((match): match is NonNullable<typeof match> => Boolean(match))
          .map((match) => 1 - match.distance / tolerance)
      );
      const strength = mean(
        matches
          .filter((match): match is NonNullable<typeof match> => Boolean(match))
          .map((match) => match.peak.strength / maximumStrength)
      );
      const centre = (first + last) / 2;
      const expectedCentre = (regionStart + regionEnd) / 2;
      const centreScore = clamp(1 - Math.abs(centre - expectedCentre) / Math.max(1, span));
      const spanScore = clamp(1 - Math.abs(last - first - span) / Math.max(1, span));
      const score =
        matchRatio * 0.5 + alignment * 0.2 + strength * 0.15 + centreScore * 0.08 + spanScore * 0.07;

      if (!best || score > best.score) {
        best = {
          score,
          fit: { boundaries, confidence: clamp(score), matched },
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
    return luminance < 190 && data[offset + 3] > 100;
  };

  const longestRun = (isMarked: (index: number) => boolean) => {
    let longest = 0;
    let current = 0;
    let gap = 0;
    const allowedGap = 3;
    for (let index = 0; index < sampleLength; index += 1) {
      if (isMarked(index)) {
        current += gap + 1;
        gap = 0;
      } else if (current > 0 && gap < allowedGap) {
        gap += 1;
      } else {
        longest = Math.max(longest, current);
        current = 0;
        gap = 0;
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
  return boundaries.slice(0, -1).map((value, index) => (value + boundaries[index + 1]) / 2);
}

function regularGrid(
  boundsInput: NormalizedRect,
  columns: number,
  rows: number,
  method: DetectedPerformanceGrid["method"],
  confidence: number
): DetectedPerformanceGrid {
  const bounds = normalizeBounds(boundsInput);
  return {
    columnCenters: Array.from(
      { length: columns },
      (_, index) => bounds.x + (bounds.width * (index + 0.5)) / columns
    ),
    rowCenters: Array.from(
      { length: rows },
      (_, index) => bounds.y + (bounds.height * (index + 0.5)) / rows
    ),
    confidence,
    method,
    diagnostics: {
      verticalCandidates: method === "manual-box" ? columns + 1 : 0,
      horizontalCandidates: method === "manual-box" ? rows + 1 : 0,
      matchedColumns: method === "manual-box" ? columns : 0,
      matchedRows: method === "manual-box" ? rows : 0,
    },
  };
}

export function gridFromManualBox(
  rect: NormalizedRect,
  columns = 5,
  rows = 22
): DetectedPerformanceGrid {
  return regularGrid(rect, columns, rows, "manual-box", 0.6);
}

export function detectPerformanceGrid(
  image: HTMLImageElement,
  options: GridDetectionOptions = { columns: 5, rows: 22 }
): DetectedPerformanceGrid {
  const columns = Math.max(1, Math.round(options.columns));
  const rows = Math.max(1, Math.round(options.rows));
  const normalized = normalizeBounds(options.searchBounds);
  const naturalWidth = image.naturalWidth;
  const naturalHeight = image.naturalHeight;
  if (!naturalWidth || !naturalHeight) {
    return regularGrid(normalized, columns, rows, "layout-fallback", 0.2);
  }

  const scale = Math.min(1, 1800 / naturalWidth);
  const width = Math.max(1, Math.round(naturalWidth * scale));
  const height = Math.max(1, Math.round(naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return regularGrid(normalized, columns, rows, "layout-fallback", 0.2);

  context.drawImage(image, 0, 0, width, height);
  const data = context.getImageData(0, 0, width, height).data;
  const pixelBounds = {
    left: normalized.x * width,
    right: (normalized.x + normalized.width) * width,
    top: normalized.y * height,
    bottom: (normalized.y + normalized.height) * height,
  };

  const horizontalScores = continuousRunScores(
    data,
    width,
    height,
    pixelBounds,
    "horizontal"
  );
  const verticalScores = continuousRunScores(
    data,
    width,
    height,
    pixelBounds,
    "vertical"
  );
  const horizontalPeaks = clusterScores(
    horizontalScores.scores,
    rows > 15 ? 0.42 : 0.5,
    horizontalScores.offset
  );
  const verticalPeaks = clusterScores(
    verticalScores.scores,
    columns > 8 ? 0.42 : 0.52,
    verticalScores.offset
  );
  const horizontalFit = fitRegularBoundaries(
    horizontalPeaks,
    rows + 1,
    pixelBounds.top,
    pixelBounds.bottom
  );
  const verticalFit = fitRegularBoundaries(
    verticalPeaks,
    columns + 1,
    pixelBounds.left,
    pixelBounds.right
  );

  if (!horizontalFit || !verticalFit) {
    const fallback = regularGrid(normalized, columns, rows, "layout-fallback", 0.25);
    return {
      ...fallback,
      diagnostics: {
        verticalCandidates: verticalPeaks.length,
        horizontalCandidates: horizontalPeaks.length,
        matchedColumns: verticalFit ? Math.max(0, verticalFit.matched - 1) : 0,
        matchedRows: horizontalFit ? Math.max(0, horizontalFit.matched - 1) : 0,
      },
    };
  }

  return {
    columnCenters: centresFromBoundaries(verticalFit.boundaries).map((value) => value / width),
    rowCenters: centresFromBoundaries(horizontalFit.boundaries).map((value) => value / height),
    confidence: clamp(verticalFit.confidence * 0.45 + horizontalFit.confidence * 0.55),
    method: "pixel-lines",
    diagnostics: {
      verticalCandidates: verticalPeaks.length,
      horizontalCandidates: horizontalPeaks.length,
      matchedColumns: Math.max(0, verticalFit.matched - 1),
      matchedRows: Math.max(0, horizontalFit.matched - 1),
    },
  };
}
