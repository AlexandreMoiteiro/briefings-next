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

type PixelBounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

const DEFAULT_BOUNDS: NormalizedRect = {
  x: 0.06,
  y: 0.12,
  width: 0.89,
  height: 0.82,
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

function deviation(values: number[]) {
  if (!values.length) return 0;
  const average = mean(values);
  return Math.sqrt(
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) /
      values.length
  );
}

function smooth(values: number[], radius: number) {
  return values.map((_, index) => {
    let sum = 0;
    let count = 0;
    for (
      let candidate = Math.max(0, index - radius);
      candidate <= Math.min(values.length - 1, index + radius);
      candidate += 1
    ) {
      sum += values[candidate];
      count += 1;
    }
    return sum / Math.max(1, count);
  });
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
    if (total > 0) {
      peaks.push({ position: weighted / total, strength: strongest });
    }
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

function mergePeaks(peaks: Peak[], minimumDistance: number) {
  const sorted = [...peaks].sort((a, b) => a.position - b.position);
  const merged: Peak[] = [];

  for (const peak of sorted) {
    const previous = merged[merged.length - 1];
    if (!previous || peak.position - previous.position > minimumDistance) {
      merged.push({ ...peak });
      continue;
    }

    const total = previous.strength + peak.strength;
    previous.position =
      (previous.position * previous.strength + peak.position * peak.strength) /
      Math.max(total, 1e-9);
    previous.strength = Math.max(previous.strength, peak.strength);
  }

  return merged;
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

function fitBoundaries(
  peaksInput: Peak[],
  boundaryCount: number,
  regionStart: number,
  regionEnd: number
): BoundaryFit | null {
  if (boundaryCount < 2) return null;
  const regionSpan = Math.max(1, regionEnd - regionStart);
  const peaks = mergePeaks(
    [
      ...peaksInput,
      { position: regionStart, strength: 0.18 },
      { position: regionEnd, strength: 0.18 },
    ],
    2
  );
  if (peaks.length < 2) return null;

  const maximumStrength = Math.max(1, ...peaks.map((peak) => peak.strength));
  let best: { score: number; fit: BoundaryFit } | null = null;

  for (let firstIndex = 0; firstIndex < peaks.length - 1; firstIndex += 1) {
    for (let lastIndex = firstIndex + 1; lastIndex < peaks.length; lastIndex += 1) {
      const first = peaks[firstIndex].position;
      const last = peaks[lastIndex].position;
      const span = last - first;
      if (span < regionSpan * 0.22 || span > regionSpan * 1.02) continue;

      const gap = span / (boundaryCount - 1);
      if (gap < 2) continue;
      const tolerance = Math.max(3, gap * 0.46);
      const targets = Array.from(
        { length: boundaryCount },
        (_, index) => first + gap * index
      );
      const matches = targets.map((target) =>
        nearestPeak(peaksInput, target, tolerance)
      );
      const matched = matches.filter(Boolean).length;
      const matchRatio = matched / boundaryCount;
      if (matchRatio < 0.42) continue;

      const boundaries = targets.map((target, index) =>
        matches[index] ? matches[index]!.peak.position : target
      );
      const gaps = boundaries
        .slice(1)
        .map((value, index) => value - boundaries[index]);
      if (gaps.some((value) => value <= 0)) continue;

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
      const regularity = clamp(
        1 - deviation(gaps) / Math.max(mean(gaps), 1)
      );
      const coverage = clamp(span / (regionSpan * 0.62));
      const edgeSupport =
        (matches[0] ? 0.5 : 0) +
        (matches[matches.length - 1] ? 0.5 : 0);
      const score =
        matchRatio * 0.46 +
        alignment * 0.2 +
        strength * 0.14 +
        coverage * 0.1 +
        regularity * 0.06 +
        edgeSupport * 0.04;

      if (!best || score > best.score) {
        best = {
          score,
          fit: {
            boundaries,
            confidence: clamp(score),
            matched,
          },
        };
      }
    }
  }

  return best?.fit ?? null;
}

function luminanceThreshold(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  bounds: PixelBounds
) {
  const values: number[] = [];
  const left = Math.max(0, Math.floor(bounds.left));
  const right = Math.min(width - 1, Math.ceil(bounds.right));
  const top = Math.max(0, Math.floor(bounds.top));
  const bottom = Math.min(height - 1, Math.ceil(bounds.bottom));
  const step = Math.max(2, Math.round(Math.min(width, height) / 700));

  for (let y = top; y <= bottom; y += step) {
    for (let x = left; x <= right; x += step) {
      const offset = (y * width + x) * 4;
      if (data[offset + 3] < 100) continue;
      values.push(
        data[offset] * 0.299 +
          data[offset + 1] * 0.587 +
          data[offset + 2] * 0.114
      );
    }
  }

  const average = mean(values);
  const spread = deviation(values);
  return clamp(average - Math.max(18, spread * 0.48), 145, 225);
}

function lineScores(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  bounds: PixelBounds,
  orientation: "horizontal" | "vertical",
  threshold: number
) {
  const left = Math.max(0, Math.floor(bounds.left));
  const right = Math.min(width - 1, Math.ceil(bounds.right));
  const top = Math.max(0, Math.floor(bounds.top));
  const bottom = Math.min(height - 1, Math.ceil(bounds.bottom));
  const sampleLength =
    orientation === "horizontal" ? right - left + 1 : bottom - top + 1;
  const scoreLength =
    orientation === "horizontal" ? bottom - top + 1 : right - left + 1;
  const scores = new Array<number>(Math.max(0, scoreLength)).fill(0);
  const allowedGap = Math.max(2, Math.round(sampleLength * 0.005));

  const isDark = (x: number, y: number) => {
    const offset = (y * width + x) * 4;
    const luminance =
      data[offset] * 0.299 +
      data[offset + 1] * 0.587 +
      data[offset + 2] * 0.114;
    return luminance < threshold && data[offset + 3] > 100;
  };

  const scoreLine = (isMarked: (index: number) => boolean) => {
    let longest = 0;
    let current = 0;
    let pendingGap = 0;
    let dark = 0;

    for (let index = 0; index < sampleLength; index += 1) {
      if (isMarked(index)) {
        dark += 1;
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

    longest = Math.max(longest, current);
    const runRatio = longest / Math.max(1, sampleLength);
    const density = dark / Math.max(1, sampleLength);
    return clamp(runRatio * 0.78 + Math.min(1, density * 2.2) * 0.22);
  };

  if (orientation === "horizontal") {
    for (let y = top; y <= bottom; y += 1) {
      scores[y - top] = scoreLine((index) => isDark(left + index, y));
    }
  } else {
    for (let x = left; x <= right; x += 1) {
      scores[x - left] = scoreLine((index) => isDark(x, top + index));
    }
  }

  return {
    scores: smooth(scores, 1),
    offset: orientation === "horizontal" ? top : left,
  };
}

function bestAxisFit(
  scores: number[],
  offset: number,
  boundaryCount: number,
  regionStart: number,
  regionEnd: number
) {
  const thresholds = [0.24, 0.3, 0.36, 0.42, 0.5, 0.58];
  let best: { fit: BoundaryFit; peaks: Peak[] } | null = null;
  let allPeaks: Peak[] = [];

  for (const threshold of thresholds) {
    const peaks = clusterScores(scores, threshold, offset);
    allPeaks = mergePeaks([...allPeaks, ...peaks], 2);
    const fit = fitBoundaries(peaks, boundaryCount, regionStart, regionEnd);
    if (!fit) continue;
    if (!best || fit.confidence > best.fit.confidence) {
      best = { fit, peaks };
    }
  }

  if (!best && allPeaks.length) {
    const fit = fitBoundaries(
      allPeaks,
      boundaryCount,
      regionStart,
      regionEnd
    );
    if (fit) best = { fit, peaks: allPeaks };
  }

  return {
    fit: best?.fit ?? null,
    candidateCount: allPeaks.length,
  };
}

function centresFromBoundaries(boundaries: number[]) {
  return boundaries
    .slice(0, -1)
    .map((value, index) => (value + boundaries[index + 1]) / 2);
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
  return regularGrid(rect, columns, rows, "manual-box", 0.72);
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
    return regularGrid(normalized, columns, rows, "layout-fallback", 0.18);
  }

  const scale = Math.min(1, 2200 / naturalWidth);
  const width = Math.max(1, Math.round(naturalWidth * scale));
  const height = Math.max(1, Math.round(naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return regularGrid(normalized, columns, rows, "layout-fallback", 0.18);
  }

  context.drawImage(image, 0, 0, width, height);
  const data = context.getImageData(0, 0, width, height).data;
  const pixelBounds: PixelBounds = {
    left: normalized.x * width,
    right: (normalized.x + normalized.width) * width,
    top: normalized.y * height,
    bottom: (normalized.y + normalized.height) * height,
  };
  const threshold = luminanceThreshold(data, width, height, pixelBounds);

  const horizontal = lineScores(
    data,
    width,
    height,
    pixelBounds,
    "horizontal",
    threshold
  );
  const vertical = lineScores(
    data,
    width,
    height,
    pixelBounds,
    "vertical",
    threshold
  );

  const horizontalResult = bestAxisFit(
    horizontal.scores,
    horizontal.offset,
    rows + 1,
    pixelBounds.top,
    pixelBounds.bottom
  );
  const verticalResult = bestAxisFit(
    vertical.scores,
    vertical.offset,
    columns + 1,
    pixelBounds.left,
    pixelBounds.right
  );

  const horizontalFit = horizontalResult.fit;
  const verticalFit = verticalResult.fit;
  const base = regularGrid(
    normalized,
    columns,
    rows,
    "layout-fallback",
    options.searchBounds ? 0.42 : 0.28
  );

  if (!horizontalFit && !verticalFit) {
    return {
      ...base,
      diagnostics: {
        verticalCandidates: verticalResult.candidateCount,
        horizontalCandidates: horizontalResult.candidateCount,
        matchedColumns: 0,
        matchedRows: 0,
      },
    };
  }

  const columnCenters = verticalFit
    ? centresFromBoundaries(verticalFit.boundaries).map((value) => value / width)
    : base.columnCenters;
  const rowCenters = horizontalFit
    ? centresFromBoundaries(horizontalFit.boundaries).map((value) => value / height)
    : base.rowCenters;
  const matchedColumns = verticalFit
    ? Math.min(columns, Math.max(0, verticalFit.matched - 1))
    : 0;
  const matchedRows = horizontalFit
    ? Math.min(rows, Math.max(0, horizontalFit.matched - 1))
    : 0;
  const confidence = clamp(
    (verticalFit?.confidence ?? 0.24) * 0.44 +
      (horizontalFit?.confidence ?? 0.24) * 0.56
  );

  return {
    columnCenters,
    rowCenters,
    confidence,
    method: horizontalFit && verticalFit ? "pixel-lines" : "layout-fallback",
    diagnostics: {
      verticalCandidates: verticalResult.candidateCount,
      horizontalCandidates: horizontalResult.candidateCount,
      matchedColumns,
      matchedRows,
    },
  };
}
