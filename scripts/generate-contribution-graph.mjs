import {
  THEME,
  CARD_WIDTH,
  USERNAME,
  escapeXml,
  formatCount,
  fullDate,
  fetchContributions,
  renderCard,
  writeSvg,
} from "./theme.mjs";

const CELL = 11;
const GAP = 3;
const STEP = CELL + GAP;
const RADIUS = 2;
const WEEKDAY_LABEL_WIDTH = 30;
const TOP_PAD = 66;
const BOTTOM_PAD = 38;
const WIDTH = CARD_WIDTH;

const WEEKDAY_LABELS = ["Mon", "", "Wed", "", "Fri", "", ""];
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MIN_MONTH_GAP = 3; // Spalten Abstand, damit sich Monatsnamen nicht überlappen

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

  // Angeschnittener erster Monat: Label weglassen, wenn der nächste zu nah kommt
  if (labels.length > 1 && labels[1].index - labels[0].index < MIN_MONTH_GAP) labels.shift();
  return labels;
}

function renderLegend(gridRight, legendY) {
  const textY = legendY + CELL - 2;
  const moreWidth = 28;
  const swatchesRight = gridRight - moreWidth;
  const swatchesLeft = swatchesRight - (THEME.levels.length * STEP - GAP);

  const swatches = THEME.levels
    .map((color, i) => `<rect x="${swatchesLeft + i * STEP}" y="${legendY}" width="${CELL}" height="${CELL}" rx="${RADIUS}" fill="${color}"/>`)
    .join("");

  return `<text x="${swatchesLeft - 8}" y="${textY}" text-anchor="end" font-size="10" fill="${THEME.muted}">Less</text>
  ${swatches}
  <text x="${gridRight}" y="${textY}" text-anchor="end" font-size="10" fill="${THEME.muted}">More</text>`;
}

function renderSvg({ contributions, total }) {
  const columns = buildColumns(contributions);
  const gridWidth = columns.length * STEP - GAP;
  const gridHeight = 7 * STEP - GAP;
  // Wochentage + Raster zusammen horizontal zentrieren
  const gridLeft = Math.round((WIDTH - WEEKDAY_LABEL_WIDTH - gridWidth) / 2) + WEEKDAY_LABEL_WIDTH;
  const gridRight = gridLeft + gridWidth;
  const height = TOP_PAD + gridHeight + BOTTOM_PAD;

  const cells = [];
  columns.forEach((col, colIndex) => {
    col.forEach((day, row) => {
      if (!day) return;
      const x = gridLeft + colIndex * STEP;
      const y = TOP_PAD + row * STEP;
      const color = THEME.levels[day.level] ?? THEME.levels[0];
      cells.push(
        `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="${RADIUS}" fill="${color}"><title>${escapeXml(`${formatCount(day.count)} on ${fullDate(day.date)}`)}</title></rect>`
      );
    });
  });

  const monthLabels = monthLabelsFor(columns)
    .map(({ index, label }) => `<text x="${gridLeft + index * STEP}" y="${TOP_PAD - 9}" font-size="11" fill="${THEME.muted}">${label}</text>`)
    .join("");

  const weekdayLabels = WEEKDAY_LABELS
    .map((label, row) => {
      if (!label) return "";
      const y = TOP_PAD + row * STEP + CELL - 2;
      return `<text x="${gridLeft - 8}" y="${y}" text-anchor="end" font-size="10" fill="${THEME.muted}">${label}</text>`;
    })
    .join("");

  return renderCard({
    width: WIDTH,
    height,
    label: `GitHub contributions by ${USERNAME}: ${formatCount(total)} in the last year`,
    title: "Contributions",
    meta: `${total.toLocaleString("en-US")} in the last year`,
    body: `${monthLabels}
  ${weekdayLabels}
  ${cells.join("")}
  ${renderLegend(gridRight, TOP_PAD + gridHeight + 14)}`,
  });
}

async function main() {
  const data = await fetchContributions();
  const total = data.total?.lastYear ?? data.contributions.reduce((sum, d) => sum + d.count, 0);
  const outFile = await writeSvg("contribution-graph.svg", renderSvg({ contributions: data.contributions, total }));
  console.log(`✓ Wrote ${outFile} — ${data.contributions.length} days, ${total} contributions`);
}

main().catch((err) => {
  console.error("✗ Contribution graph generation failed:", err.message);
  process.exit(1);
});
