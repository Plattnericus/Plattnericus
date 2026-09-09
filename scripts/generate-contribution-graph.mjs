import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const USERNAME = process.env.GITHUB_USERNAME || "Plattnericus";
const API_URL = `https://github-contributions-api.jogruber.de/v4/${USERNAME}?y=last`;

const OUT_DIR = "assets";
const OUT_FILE = path.join(OUT_DIR, "contribution-graph.svg");

const CELL = 11;
const GAP = 3;
const RADIUS = 2;
const LEFT_PAD = 40;
const TOP_PAD = 58;
const RIGHT_PAD = 20;
const BOTTOM_PAD = 34;

// Exakt die Palette, die im Rest des READMEs schon verwendet wird
// (Header-Gradient, Badges, Typing-SVG): 0d1320 -> 2b4f81 -> 4a7fc4 -> 6ea8ff.
const COLORS = ["#161d2c", "#1f3a63", "#2b4f81", "#4a7fc4", "#6ea8ff"];
const BG = "#0d1320";
const FG = "#e6edf3";
const MUTED = "#8790a3";

const WEEKDAY_LABELS = ["Mon", "", "Wed", "", "Fri", "", ""];
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatDate(dateStr) {
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

// Baut Mo–So-Wochenspalten exakt wie GitHubs eigener Graph,
// inkl. unvollständiger erster/letzter Spalte.
function buildColumns(contributions) {
  const columns = [];
  let col = -1;

  for (const day of contributions) {
    const date = new Date(`${day.date}T00:00:00Z`);
    const row = (date.getUTCDay() + 6) % 7; // Mon=0 ... Sun=6

    if (col === -1 || row === 0) col += 1;
    columns[col] = columns[col] || [];
    columns[col][row] = day;
  }

  return columns;
}

function monthLabelsFor(columns) {
  const labels = [];
  let lastMonth = -1;

  columns.forEach((col, i) => {
    const firstDay = col.find(Boolean);
    if (!firstDay) return;
    const month = new Date(`${firstDay.date}T00:00:00Z`).getUTCMonth();
    if (month !== lastMonth) {
      labels.push({ index: i, label: MONTH_LABELS[month] });
      lastMonth = month;
    }
  });

  return labels;
}

function renderLegend(width, height) {
  const legendY = height - BOTTOM_PAD + 12;
  const moreX = width - RIGHT_PAD;
  const swatchesRightEdge = moreX - 28;
  const swatchesWidth = COLORS.length * CELL + (COLORS.length - 1) * GAP;
  const swatchesLeftEdge = swatchesRightEdge - swatchesWidth;
  const lessX = swatchesLeftEdge - 8;
  const textY = legendY + CELL - 2;

  const swatches = COLORS.map((color, i) => {
    const x = swatchesLeftEdge + i * (CELL + GAP);
    return `<rect x="${x}" y="${legendY}" width="${CELL}" height="${CELL}" rx="${RADIUS}" fill="${color}"/>`;
  }).join("");

  return `
    <text x="${lessX}" y="${textY}" text-anchor="end" font-size="10" fill="${MUTED}">Less</text>
    ${swatches}
    <text x="${moreX}" y="${textY}" text-anchor="end" font-size="10" fill="${MUTED}">More</text>`;
}

function renderSvg({ contributions, total }) {
  const columns = buildColumns(contributions);
  const width = LEFT_PAD + columns.length * (CELL + GAP) - GAP + RIGHT_PAD;
  const height = TOP_PAD + 7 * (CELL + GAP) - GAP + BOTTOM_PAD;

  const cells = [];
  columns.forEach((col, colIndex) => {
    col.forEach((day, row) => {
      if (!day) return;
      const x = LEFT_PAD + colIndex * (CELL + GAP);
      const y = TOP_PAD + row * (CELL + GAP);
      const color = COLORS[day.level] ?? COLORS[0];
      const unit = day.count === 1 ? "commit" : "commits";
      cells.push(
        `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="${RADIUS}" fill="${color}"><title>${escapeXml(`${day.count} ${unit} on ${formatDate(day.date)}`)}</title></rect>`
      );
    });
  });

  const monthLabels = monthLabelsFor(columns)
    .map(({ index, label }) => {
      const x = LEFT_PAD + index * (CELL + GAP);
      return `<text x="${x}" y="${TOP_PAD - 10}" font-size="11" fill="${MUTED}">${label}</text>`;
    })
    .join("");

  const weekdayLabels = WEEKDAY_LABELS
    .map((label, row) => {
      if (!label) return "";
      const y = TOP_PAD + row * (CELL + GAP) + CELL - 2;
      return `<text x="${LEFT_PAD - 8}" y="${y}" text-anchor="end" font-size="10" fill="${MUTED}">${label}</text>`;
    })
    .join("");

  return `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" font-family="'Fira Code', ui-monospace, SFMono-Regular, monospace" role="img" aria-label="${escapeXml(`GitHub commits by ${USERNAME}: ${total} in the last year`)}">
  <rect width="${width}" height="${height}" rx="14" fill="${BG}"/>
  <text x="20" y="27" font-size="16" font-weight="600" fill="${FG}">GitHub Commits</text>
  <text x="${width - RIGHT_PAD}" y="27" text-anchor="end" font-size="12" fill="${MUTED}">${total.toLocaleString("en-US")} in the last year</text>
  ${monthLabels}
  ${weekdayLabels}
  ${cells.join("")}
  ${renderLegend(width, height)}
</svg>`;
}

async function main() {
  const data = await fetchContributions();
  const total = data.total?.lastYear ?? data.contributions.reduce((sum, d) => sum + d.count, 0);
  const svg = renderSvg({ contributions: data.contributions, total });

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT_FILE, svg, "utf8");
  console.log(`✓ Wrote ${OUT_FILE} — ${data.contributions.length} days, ${total} commits`);
}

main().catch((err) => {
  console.error("✗ Contribution graph generation failed:", err.message);
  process.exit(1);
});
