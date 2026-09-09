import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const USERNAME = process.env.GITHUB_USERNAME || "Plattnericus";
const API_URL = `https://github-contributions-api.jogruber.de/v4/${USERNAME}?y=last`;

const OUT_DIR = "assets";
const OUT_FILE = path.join(OUT_DIR, "contribution-graph.svg");

const CELL = 11;
const GAP = 3;
const RADIUS = 2;
const LEFT_PAD = 44;
const TOP_PAD = 62;
const RIGHT_PAD = 22;
const BOTTOM_PAD = 38;

const COLORS = ["#161b29", "#2d2a63", "#4a3f96", "#6650d6", "#8f6bf5"];
const BG = "#0d1320";
const FG = "#e6edf3";
const MUTED = "#8790a3";

const WEEKDAY_LABELS = ["Mo", "", "Mi", "", "Fr", "", ""];
const MONTH_LABELS_DE = ["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"];

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function germanDate(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return d.toLocaleDateString("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

async function fetchContributions() {
  const res = await fetch(API_URL, { headers: { "cache-control": "no-cache" } });
  if (!res.ok) {
    throw new Error(`Contribution API antwortete mit HTTP ${res.status} für ${USERNAME}`);
  }
  return res.json();
}

// Baut Wochen-Spalten (Mo–So), exakt wie GitHubs eigener Contribution-Graph,
// inkl. unvollständiger erster/letzter Spalte.
function buildColumns(contributions) {
  const columns = [];
  let col = -1;

  for (const day of contributions) {
    const date = new Date(`${day.date}T00:00:00Z`);
    const row = (date.getUTCDay() + 6) % 7; // Mo=0 ... So=6

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
      labels.push({ index: i, label: MONTH_LABELS_DE[month] });
      lastMonth = month;
    }
  });

  return labels;
}

function renderLegend(width, height) {
  const legendY = height - BOTTOM_PAD + 14;
  const mehrX = width - RIGHT_PAD;
  const swatchesRightEdge = mehrX - 34;
  const swatchesWidth = COLORS.length * CELL + (COLORS.length - 1) * GAP;
  const swatchesLeftEdge = swatchesRightEdge - swatchesWidth;
  const wenigerX = swatchesLeftEdge - 8;
  const textY = legendY + CELL - 2;

  const swatches = COLORS.map((color, i) => {
    const x = swatchesLeftEdge + i * (CELL + GAP);
    return `<rect x="${x}" y="${legendY}" width="${CELL}" height="${CELL}" rx="${RADIUS}" fill="${color}"/>`;
  }).join("");

  return `
    <text x="${wenigerX}" y="${textY}" text-anchor="end" font-size="10" fill="${MUTED}">Weniger</text>
    ${swatches}
    <text x="${mehrX}" y="${textY}" text-anchor="end" font-size="10" fill="${MUTED}">Mehr</text>`;
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
      const unit = day.count === 1 ? "Beitrag" : "Beiträge";
      cells.push(
        `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="${RADIUS}" fill="${color}"><title>${escapeXml(`${day.count} ${unit} · ${germanDate(day.date)}`)}</title></rect>`
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
      return `<text x="${LEFT_PAD - 10}" y="${y}" text-anchor="end" font-size="10" fill="${MUTED}">${label}</text>`;
    })
    .join("");

  return `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" font-family="'Fira Code', ui-monospace, SFMono-Regular, monospace" role="img" aria-label="${escapeXml(`GitHub-Aktivität von ${USERNAME}: ${total} Beiträge im letzten Jahr`)}">
  <defs>
    <pattern id="hex" width="26" height="22" patternUnits="userSpaceOnUse">
      <path d="M13 0 L26 6.5 L26 15.5 L13 22 L0 15.5 L0 6.5 Z" fill="none" stroke="#ffffff" stroke-opacity="0.025" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="${width}" height="${height}" rx="14" fill="${BG}"/>
  <rect width="${width}" height="${height}" rx="14" fill="url(#hex)"/>
  <text x="24" y="30" font-size="17" font-weight="600" fill="${FG}">GitHub-Aktivität</text>
  <text x="${width - RIGHT_PAD}" y="30" text-anchor="end" font-size="13" fill="${MUTED}">${total.toLocaleString("de-DE")} Beiträge im letzten Jahr</text>
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
  console.log(`✓ ${OUT_FILE} geschrieben — ${data.contributions.length} Tage, ${total} Beiträge`);
}

main().catch((err) => {
  console.error("✗ Contribution-Graph-Generierung fehlgeschlagen:", err);
  process.exit(1);
});
