import {
  THEME,
  CARD_WIDTH,
  USERNAME,
  escapeXml,
  fmt,
  formatCount,
  fullDate,
  fetchContributions,
  renderCard,
  writeSvg,
} from "./theme.mjs";

const WINDOW_DAYS = 30;
const WIDTH = CARD_WIDTH;
const CHART_LEFT = 52; // Platz für die Y-Achsenbeschriftung
const CHART_RIGHT = WIDTH - 40;
const CHART_TOP = 58;
const CHART_HEIGHT = 108;
const CHART_BOTTOM = CHART_TOP + CHART_HEIGHT;
const HEIGHT = CHART_BOTTOM + 38;
const LABEL_EVERY = 5; // jeder 5. Tag bekommt eine Datumsbeschriftung

function shortDate(dateStr) {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

// Monotone kubische Interpolation (Steffen, wie d3.curveMonotoneX): glatt, aber
// ohne Überschwinger. Die Kurve geht nie unter die Nulllinie und nie über einen Peak.
function smoothLinePath(points) {
  const n = points.length;
  if (n < 3) return points.map((p, i) => `${i ? "L" : "M"} ${fmt(p.x)} ${fmt(p.y)}`).join(" ");

  const slopes = [];
  for (let i = 0; i < n - 1; i++) {
    slopes.push((points[i + 1].y - points[i].y) / (points[i + 1].x - points[i].x));
  }

  const tangents = new Array(n);
  for (let i = 1; i < n - 1; i++) {
    const s0 = slopes[i - 1];
    const s1 = slopes[i];
    const h0 = points[i].x - points[i - 1].x;
    const h1 = points[i + 1].x - points[i].x;
    const p = (s0 * h1 + s1 * h0) / (h0 + h1);
    tangents[i] = (Math.sign(s0) + Math.sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) || 0;
  }
  tangents[0] = (3 * slopes[0] - tangents[1]) / 2;
  tangents[n - 1] = (3 * slopes[n - 2] - tangents[n - 2]) / 2;

  let d = `M ${fmt(points[0].x)} ${fmt(points[0].y)}`;
  for (let i = 0; i < n - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dx = (b.x - a.x) / 3;
    d += ` C ${fmt(a.x + dx)} ${fmt(a.y + dx * tangents[i])}, ${fmt(b.x - dx)} ${fmt(b.y - dx * tangents[i + 1])}, ${fmt(b.x)} ${fmt(b.y)}`;
  }
  return d;
}

function renderSvg({ days, total }) {
  const maxCount = Math.max(...days.map((d) => d.count), 1);
  const spacing = (CHART_RIGHT - CHART_LEFT) / (days.length - 1);

  const points = days.map((day, i) => ({
    x: CHART_LEFT + i * spacing,
    y: CHART_BOTTOM - (day.count / maxCount) * CHART_HEIGHT,
    day,
  }));

  const line = smoothLinePath(points);
  const area = `${line} L ${fmt(points.at(-1).x)} ${CHART_BOTTOM} L ${fmt(points[0].x)} ${CHART_BOTTOM} Z`;

  const axis = `
  <line x1="${CHART_LEFT}" y1="${CHART_TOP}" x2="${CHART_RIGHT}" y2="${CHART_TOP}" stroke="${THEME.grid}" stroke-dasharray="3 5"/>
  <line x1="${CHART_LEFT}" y1="${CHART_BOTTOM}" x2="${CHART_RIGHT}" y2="${CHART_BOTTOM}" stroke="${THEME.grid}"/>
  <text x="${CHART_LEFT - 12}" y="${CHART_TOP + 4}" text-anchor="end" font-size="10" fill="${THEME.muted}">${maxCount}</text>
  <text x="${CHART_LEFT - 12}" y="${CHART_BOTTOM + 4}" text-anchor="end" font-size="10" fill="${THEME.muted}">0</text>`;

  const circles = points
    .map(
      ({ x, y, day }) =>
        `<circle cx="${fmt(x)}" cy="${fmt(y)}" r="3" fill="${THEME.accent}" stroke="${THEME.bg}" stroke-width="1.5"><title>${escapeXml(`${formatCount(day.count)} on ${fullDate(day.date)}`)}</title></circle>`
    )
    .join("");

  const dateLabels = points
    .filter((_, i) => i % LABEL_EVERY === 0 || i === points.length - 1)
    .map(({ x, day }) => `<text x="${fmt(x)}" y="${CHART_BOTTOM + 22}" text-anchor="middle" font-size="10" fill="${THEME.muted}">${shortDate(day.date)}</text>`)
    .join("");

  return renderCard({
    width: WIDTH,
    height: HEIGHT,
    label: `Contribution activity for ${USERNAME}: ${formatCount(total)} in the last ${days.length} days`,
    title: "Activity",
    meta: `${total.toLocaleString("en-US")} in the last ${days.length} days`,
    defs: `
    <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${THEME.accent}" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="${THEME.accent}" stop-opacity="0"/>
    </linearGradient>
  `,
    body: `${axis}
  <path d="${area}" fill="url(#areaFill)"/>
  <path d="${line}" fill="none" stroke="${THEME.accent}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  ${circles}
  ${dateLabels}`,
  });
}

async function main() {
  const data = await fetchContributions();
  const days = data.contributions.slice(-WINDOW_DAYS);
  const total = days.reduce((sum, d) => sum + d.count, 0);
  const outFile = await writeSvg("activity-graph.svg", renderSvg({ days, total }));
  console.log(`✓ Wrote ${outFile} — ${days.length} days, ${total} contributions`);
}

main().catch((err) => {
  console.error("✗ Activity graph generation failed:", err.message);
  process.exit(1);
});
