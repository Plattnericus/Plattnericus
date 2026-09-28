import { THEME, FONT, CARD_WIDTH, CARD_RADIUS, escapeXml, writeSvg } from "./theme.mjs";

// Inhalt des Terminals im README. Hier bearbeiten, der Rest passt sich an.
const SESSION = [
  { cmd: "whoami", out: ["Nexor, fullstack developer"] },
  {
    cmd: "currently",
    rows: [
      ["building", "POKYH, a school platform that real students use every day"],
      ["running", "self-hosted infrastructure on Docker and Linux"],
      ["learning", "security, properly this time"],
    ],
  },
  { cmd: "why", out: ["The half where you have to run the thing yourself", "taught me more than the coding did."] },
];

const WIDTH = CARD_WIDTH;
const BAR_HEIGHT = 38;
const PAD_X = 24;
const VALUE_X = PAD_X + 112; // zweite Spalte bei building/running/learning
const FIRST_LINE = BAR_HEIGHT + 32;
const LINE_HEIGHT = 22;
const FONT_SIZE = 14;

function renderSvg() {
  const lines = [];
  const plain = [];
  let y = FIRST_LINE;
  const next = () => {
    const current = y;
    y += LINE_HEIGHT;
    return current;
  };

  const prompt = (cmd) =>
    `<text x="${PAD_X}" y="${next()}"><tspan fill="${THEME.accent}">$</tspan><tspan fill="${THEME.fg}"> ${escapeXml(cmd)}</tspan></text>`;

  for (const block of SESSION) {
    lines.push(prompt(block.cmd));
    plain.push(`$ ${block.cmd}`);
    for (const text of block.out ?? []) {
      lines.push(`<text x="${PAD_X}" y="${next()}" fill="${THEME.accent}">${escapeXml(text)}</text>`);
      plain.push(text);
    }
    for (const [key, value] of block.rows ?? []) {
      const lineY = next();
      lines.push(
        `<text y="${lineY}" fill="${THEME.accent}"><tspan x="${PAD_X}">${escapeXml(key)}</tspan><tspan x="${VALUE_X}">${escapeXml(value)}</tspan></text>`
      );
      plain.push(`${key}: ${value}`);
    }
  }

  // Leerer Prompt mit blinkendem Cursor
  const cursorY = next();
  lines.push(`<text x="${PAD_X}" y="${cursorY}" fill="${THEME.accent}">$</text>`);
  lines.push(
    `<rect x="${PAD_X + 17}" y="${cursorY - 12}" width="8" height="15" rx="1" fill="${THEME.accent}"><animate attributeName="opacity" values="1;0" dur="1.1s" calcMode="discrete" repeatCount="indefinite"/></rect>`
  );

  const height = cursorY + 26;
  const label = `Terminal: ${plain.join(" · ")}`;
  const dots = THEME.levels
    .slice(2)
    .map((color, i) => `<circle cx="${22 + i * 18}" cy="${BAR_HEIGHT / 2}" r="5.5" fill="${color}"/>`)
    .join("");

  return `<svg viewBox="0 0 ${WIDTH} ${height}" width="${WIDTH}" height="${height}" xmlns="http://www.w3.org/2000/svg" font-family="${FONT}" font-size="${FONT_SIZE}" role="img" aria-label="${escapeXml(label)}">
  <title>${escapeXml(label)}</title>
  <rect x="0.5" y="0.5" width="${WIDTH - 1}" height="${height - 1}" rx="${CARD_RADIUS}" fill="${THEME.bg}" stroke="${THEME.border}"/>
  ${dots}
  <text x="${WIDTH / 2}" y="${BAR_HEIGHT / 2 + 4}" text-anchor="middle" font-size="12" fill="${THEME.muted}">nexor@plattnericus: ~</text>
  <line x1="1" y1="${BAR_HEIGHT + 0.5}" x2="${WIDTH - 1}" y2="${BAR_HEIGHT + 0.5}" stroke="${THEME.border}"/>
  ${lines.join("\n  ")}
</svg>
`;
}

async function main() {
  const outFile = await writeSvg("terminal.svg", renderSvg());
  console.log(`✓ Wrote ${outFile}`);
}

main().catch((err) => {
  console.error("✗ Terminal card generation failed:", err.message);
  process.exit(1);
});
