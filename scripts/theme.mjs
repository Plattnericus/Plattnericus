import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

// Eine Palette für alle Profil-Grafiken, abgestimmt auf plattnericus.dev.
// Das README verwendet dieselben Werte (Badges, Header, Typing-SVG).
export const THEME = {
  bg: "#0b0908",
  border: "#2a1f19",
  grid: "#2a1f19",
  fg: "#f2ede6",
  muted: "#a29a92",
  accent: "#d97757",
  // Contribution-Stufen 0–4: leer -> Kupfer -> Akzent -> Pfirsich
  levels: ["#1c1511", "#4e2417", "#8a3a22", "#d97757", "#f0a58a"],
};

export const FONT = "'Fira Code', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

// Beide Karten sind gleich breit, damit sie im README bündig untereinander stehen.
export const CARD_WIDTH = 840;
export const CARD_PAD = 20;
export const CARD_RADIUS = 14;

export const USERNAME = process.env.GITHUB_USERNAME || "Plattnericus";
export const OUT_DIR = process.env.OUT_DIR || "dist";

const API_URL = `https://github-contributions-api.jogruber.de/v4/${USERNAME}?y=last`;

export function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Koordinaten auf 2 Nachkommastellen, hält die SVGs klein
export const fmt = (n) => Number(n.toFixed(2));

export function formatCount(count) {
  return `${count.toLocaleString("en-US")} ${count === 1 ? "contribution" : "contributions"}`;
}

export function fullDate(dateStr) {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export async function fetchContributions() {
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

// Gemeinsamer Kartenrahmen mit Titel links und Kennzahl rechts
export function renderCard({ width, height, label, title, meta, defs = "", body }) {
  return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg" font-family="${FONT}" role="img" aria-label="${escapeXml(label)}">
  <title>${escapeXml(label)}</title>${defs ? `\n  <defs>${defs}</defs>` : ""}
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="${CARD_RADIUS}" fill="${THEME.bg}" stroke="${THEME.border}"/>
  <text x="${CARD_PAD}" y="31" font-size="16" font-weight="600" fill="${THEME.fg}">${escapeXml(title)}</text>
  <text x="${width - CARD_PAD}" y="31" text-anchor="end" font-size="12" fill="${THEME.muted}">${escapeXml(meta)}</text>
  ${body}
</svg>
`;
}

export async function writeSvg(fileName, svg) {
  const outFile = path.join(OUT_DIR, fileName);
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(outFile, svg, "utf8");
  return outFile;
}
