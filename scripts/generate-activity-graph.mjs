import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const USERNAME = process.env.GITHUB_USERNAME || "Plattnericus";
const API_URL = `https://github-contributions-api.jogruber.de/v4/${USERNAME}?y=last`;

const OUT_DIR = "assets";
const OUT_FILE = path.join(OUT_DIR, "activity-graph.svg");

const WINDOW_DAYS = 30;
const WIDTH = 760;
const LEFT_PAD = 20;
const RIGHT_PAD = 20;
const TOP_PAD = 50;
const CHART_HEIGHT = 110;
const BOTTOM_PAD = 34;
const LABEL_EVERY = 5; // jeder 5. Tag bekommt eine Datumsbeschriftung

// Gleiche Palette wie der Rest des READMEs.
const BG = "#0d1320";
const FG = "#e6edf3";
const MUTED = "#8790a3";
const LINE_COLOR = "#6ea8ff";
const AREA_COLOR = "#4a7fc4";
const POINT_COLOR = "#6ea8ff";

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function shortDate(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function fullDate(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

async function fetchContributions() {
  const res = await fetch(API_URL, { headers: { "cache-control": "no-cache" } });
  if (!res.ok) {
    throw new Error(`Contribution API returned HTTP ${res.status} for ${USERNAME}`);
  }
  const data = await res.json();
  if (!Array.isArray(data?.contributions) || data.contributions.length === 0) {
    throw new Error(`Contribution API returned no data for ${USERNAME}`);
  }
  return data;
}

// Catmull-Rom -> kubische Bezier-Kurve (Standard-Tension 1/6), für eine sanft
// geglättete Linie statt kantiger Geradenstücke.
function smoothLinePath(points) {
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

function buildAreaPath(points, baselineY) {
  const line = smoothLinePath(points);
  const first = points[0];
  const last = points[points.length - 1];
  return `${line} L ${last.x} ${baselineY} L ${first.x} ${baselineY} Z`;
}

function renderSvg({ days, total }) {
  const chartTop = TOP_PAD;
  const chartBottom = TOP_PAD + CHART_HEIGHT;
  const maxCount = Math.max(...days.map((d) => d.count), 1);
  const spacing = (WIDTH - LEFT_PAD - RIGHT_PAD) / (days.length - 1);

  const points = days.map((day, i) => ({
    x: LEFT_PAD + i * spacing,
    y: chartBottom - (day.count / maxCount) * CHART_HEIGHT,
    day,
  }));

  const circles = points
    .map(({ x, y, day }) => {
      const unit = day.count === 1 ? "commit" : "commits";
      return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="2.5" fill="${POINT_COLOR}"><title>${escapeXml(`${day.count} ${unit} on ${fullDate(day.date)}`)}</title></circle>`;
    })
    .join("");

  const dateLabels = points
    .filter((_, i) => i % LABEL_EVERY === 0 || i === points.length - 1)
    .map(({ x, day }) => `<text x="${x.toFixed(2)}" y="${chartBottom + 22}" text-anchor="middle" font-size="10" fill="${MUTED}">${shortDate(day.date)}</text>`)
    .join("");

  return `<svg viewBox="0 0 ${WIDTH} ${chartBottom + BOTTOM_PAD}" xmlns="http://www.w3.org/2000/svg" font-family="'Fira Code', ui-monospace, SFMono-Regular, monospace" role="img" aria-label="${escapeXml(`Commit activity for ${USERNAME}: ${total} commits in the last ${days.length} days`)}">
  <defs>
    <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${AREA_COLOR}" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="${AREA_COLOR}" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="${WIDTH}" height="${chartBottom + BOTTOM_PAD}" rx="14" fill="${BG}"/>
  <text x="20" y="27" font-size="16" font-weight="600" fill="${FG}">Commit Activity</text>
  <text x="${WIDTH - RIGHT_PAD}" y="27" text-anchor="end" font-size="12" fill="${MUTED}">${total.toLocaleString("en-US")} in the last ${days.length} days</text>
  <line x1="${LEFT_PAD}" y1="${chartBottom}" x2="${WIDTH - RIGHT_PAD}" y2="${chartBottom}" stroke="${MUTED}" stroke-opacity="0.25" stroke-width="1"/>
  <path d="${buildAreaPath(points, chartBottom)}" fill="url(#areaFill)" stroke="none"/>
  <path d="${smoothLinePath(points)}" fill="none" stroke="${LINE_COLOR}" stroke-width="2" stroke-linecap="round"/>
  ${circles}
  ${dateLabels}
</svg>`;
}

async function main() {
  const data = await fetchContributions();
  const days = data.contributions.slice(-WINDOW_DAYS);
  const total = days.reduce((sum, d) => sum + d.count, 0);
  const svg = renderSvg({ days, total });

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT_FILE, svg, "utf8");
  console.log(`✓ Wrote ${OUT_FILE} — ${days.length} days, ${total} commits`);
}

main().catch((err) => {
  console.error("✗ Activity graph generation failed:", err.message);
  process.exit(1);
});
