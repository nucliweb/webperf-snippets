// Statistics for comparing the runs of two measurements, without a browser: whether one sample tends to
// be greater than the other (Mann-Whitney U, one-sided) and by how much (the Hodges-Lehmann shift with its
// 95 % interval). Both work on ranks, so one slow run moves them less than it moves a mean.

const EXACT_UP_TO = 16;
const Z_975 = 1.959963984540054;

// The ranks of the pooled values, with the mean rank for ties, and the sizes of the groups of ties
function rank(values) {
  const order = values.map((value, i) => ({ value, i })).sort((a, b) => a.value - b.value);
  const ranks = new Array(values.length);
  const ties = [];
  for (let start = 0; start < order.length; ) {
    let end = start;
    while (end + 1 < order.length && order[end + 1].value === order[start].value) end++;
    for (let k = start; k <= end; k++) ranks[order[k].i] = (start + end) / 2 + 1;
    if (end > start) ties.push(end - start + 1);
    start = end + 1;
  }
  return { ranks, ties };
}

// How many splits of m + n distinct values give each U, from U = 0 to m * n. A split with the largest
// value in the first sample has U of the split without it plus n; otherwise, U of the split without it.
function exactCounts(m, n) {
  let prev = Array.from({ length: n + 1 }, () => [1]);
  for (let i = 1; i <= m; i++) {
    const row = [new Array(1).fill(1)];
    for (let j = 1; j <= n; j++) {
      const counts = new Array(i * j + 1).fill(0);
      prev[j].forEach((c, u) => (counts[u + j] += c));
      row[j - 1].forEach((c, u) => (counts[u] += c));
      row.push(counts);
    }
    prev = row;
  }
  return prev[n];
}

// The complementary error function, with a fractional error under 1.2e-7 (Numerical Recipes, erfcc)
function erfc(x) {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r =
    t *
    Math.exp(
      -z * z -
        1.26551223 +
        t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))
    );
  return x >= 0 ? r : 2 - r;
}

const upperTail = (z) => erfc(z / Math.SQRT2) / 2;

const isExact = (m, n, ties) => m <= EXACT_UP_TO && n <= EXACT_UP_TO && ties.length === 0;

// Whether `sample` tends to be greater than `reference`: U counts the pairs where it is (a tie counts
// half), and p is the probability of a U this large or larger if both came from the same distribution.
// For a regression of a timing, the sample is the current runs and the reference the baseline.
export function mannWhitneyGreater(sample, reference) {
  const m = sample.length;
  const n = reference.length;
  const { ranks, ties } = rank([...sample, ...reference]);
  const rankSum = ranks.slice(0, m).reduce((sum, r) => sum + r, 0);
  const u = rankSum - (m * (m + 1)) / 2;

  if (isExact(m, n, ties)) {
    const counts = exactCounts(m, n);
    const total = counts.reduce((sum, c) => sum + c, 0);
    const above = counts.slice(Math.ceil(u)).reduce((sum, c) => sum + c, 0);
    return { u, p: above / total, method: "exact" };
  }

  const N = m + n;
  const tieTerm = ties.reduce((sum, t) => sum + t ** 3 - t, 0) / (N * (N - 1));
  const sigma = Math.sqrt(((m * n) / 12) * (N + 1 - tieTerm));
  const z = (u - (m * n) / 2 - 0.5) / sigma;
  return { u, p: upperTail(z), method: "normal" };
}

const median = (sorted) => {
  const mid = sorted.length / 2;
  return sorted.length % 2 ? sorted[Math.floor(mid)] : (sorted[mid - 1] + sorted[mid]) / 2;
};

// By how much `sample` is greater than `reference`: the median of the differences of every pair, and the
// 95 % interval between two of those differences, chosen from the distribution of U. With samples too
// small for 95 %, such as three runs a side, the interval is every difference.
export function hodgesLehmann(reference, sample) {
  const m = sample.length;
  const n = reference.length;
  const diffs = sample.flatMap((s) => reference.map((r) => s - r)).sort((a, b) => a - b);
  const { ties } = rank([...sample, ...reference]);

  let k;
  if (isExact(m, n, ties)) {
    // The largest k with P(U <= k - 1) at most 2.5 %
    const counts = exactCounts(m, n);
    const total = counts.reduce((sum, c) => sum + c, 0);
    let below = 0;
    k = 0;
    while (k < counts.length && (below + counts[k]) / total <= 0.025) below += counts[k++];
  } else {
    k = Math.max(0, Math.floor((m * n) / 2 - Z_975 * Math.sqrt((m * n * (m + n + 1)) / 12)));
  }
  return { shift: median(diffs), ci: [diffs[k], diffs[m * n - 1 - k]] };
}
