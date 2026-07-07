import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assetDir = path.join(root, "assets");
const configPath = path.join(root, "data", "profile-config.json");
const statsPath = path.join(root, "data", "profile-stats.json");

const config = JSON.parse(await readFile(configPath, "utf8"));
const stats = JSON.parse(await readFile(statsPath, "utf8"));

await mkdir(assetDir, { recursive: true });

// Rebuild every visual from local config and synced GitHub data.
const writeAsset = async (name, content) => {
  await writeFile(path.join(assetDir, name), `${content.trim()}\n`, "utf8");
};

async function fetchAvatarSvg(username) {
  const fallbackPath = path.join(assetDir, "avatar.svg");

  try {
    const response = await fetch(`https://github.com/${encodeURIComponent(username)}.png?size=328`, {
      headers: { "User-Agent": "plattnericus-readme-render" }
    });

    if (!response.ok) {
      throw new Error(`GitHub avatar request failed: ${response.status}`);
    }

    const type = response.headers.get("content-type") || "image/png";
    const buffer = Buffer.from(await response.arrayBuffer());
    const encoded = buffer.toString("base64");

    return `
<svg xmlns="http://www.w3.org/2000/svg" width="328" height="328" viewBox="0 0 328 328" role="img">
  <defs>
    <clipPath id="avatarClip">
      <circle cx="164" cy="164" r="158"/>
    </clipPath>
  </defs>
  <rect width="328" height="328" rx="164" fill="${c.page}"/>
  <image href="data:${type};base64,${encoded}" x="6" y="6" width="316" height="316" preserveAspectRatio="xMidYMid slice" clip-path="url(#avatarClip)"/>
  <circle cx="164" cy="164" r="158" fill="none" stroke="${c.border}" stroke-width="2"/>
</svg>`;
  } catch (error) {
    try {
      return await readFile(fallbackPath, "utf8");
    } catch {
      return `
<svg xmlns="http://www.w3.org/2000/svg" width="328" height="328" viewBox="0 0 328 328" role="img">
  <rect width="328" height="328" rx="164" fill="${c.page}"/>
  <circle cx="164" cy="164" r="158" fill="${c.soft}" stroke="${c.border}" stroke-width="2"/>
  <text x="164" y="178" text-anchor="middle" fill="${c.muted}" font-size="42" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif">N</text>
</svg>`;
    }
  }
}

const esc = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const palettes = {
  dark: {
    page: "#111113",
    card: "#1c1c1e",
    soft: "#1c1c1e",
    border: "#3a3a3c",
    hairline: "#2c2c2e",
    text: "#f5f5f7",
    muted: "#a1a1a6",
    quiet: "#77777d",
    accent: "#0a84ff"
  },
  light: {
    page: "#fbfbfd",
    card: "#ffffff",
    soft: "#f5f5f7",
    border: "#d2d2d7",
    hairline: "#e8e8ed",
    text: "#1d1d1f",
    muted: "#6e6e73",
    quiet: "#86868b",
    accent: "#007aff"
  }
};

let c = palettes.dark;

const sharedStyle = `
  text { font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", "Segoe UI", Arial, sans-serif; letter-spacing: 0; text-rendering: geometricPrecision; }
  .rise { animation: rise .55s cubic-bezier(.2, .8, .2, 1) both; }
  .draw { stroke-dasharray: 1200; stroke-dashoffset: 1200; animation: draw 1.4s cubic-bezier(.2, .8, .2, 1) forwards; }
  .pulse { animation: pulse 2.8s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
  .nudge { animation: nudge 2.8s ease-in-out infinite; }
  .point { opacity: 1; animation: point .42s cubic-bezier(.2, .8, .2, 1) both; }
  .rot-0 { animation: rot0 12s ease-in-out infinite; }
  .rot-1 { opacity: 0; animation: rot1 12s ease-in-out infinite; }
  .rot-2 { opacity: 0; animation: rot2 12s ease-in-out infinite; }
  .rot-3 { opacity: 0; animation: rot3 12s ease-in-out infinite; }
  .status-line { stroke-dasharray: 92; stroke-dashoffset: 92; animation: draw 1.5s .25s cubic-bezier(.2, .8, .2, 1) forwards; }
  @keyframes rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes draw { to { stroke-dashoffset: 0; } }
  @keyframes pulse { 0%, 100% { opacity: .45; transform: scale(.94); } 50% { opacity: 1; transform: scale(1.04); } }
  @keyframes nudge { 0%, 100% { transform: translateX(0); opacity: .55; } 50% { transform: translateX(4px); opacity: 1; } }
  @keyframes point { from { opacity: 0; transform: translateY(4px) scale(.9); } to { opacity: 1; transform: translateY(0) scale(1); } }
  @keyframes rot0 { 0%, 20% { opacity: 1; transform: translateY(0); } 25%, 95% { opacity: 0; transform: translateY(-6px); } 100% { opacity: 1; transform: translateY(0); } }
  @keyframes rot1 { 0%, 20% { opacity: 0; transform: translateY(6px); } 25%, 45% { opacity: 1; transform: translateY(0); } 50%, 100% { opacity: 0; transform: translateY(-6px); } }
  @keyframes rot2 { 0%, 45% { opacity: 0; transform: translateY(6px); } 50%, 70% { opacity: 1; transform: translateY(0); } 75%, 100% { opacity: 0; transform: translateY(-6px); } }
  @keyframes rot3 { 0%, 70% { opacity: 0; transform: translateY(6px); } 75%, 95% { opacity: 1; transform: translateY(0); } 100% { opacity: 0; transform: translateY(-6px); } }
  @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
`;

function shell(width, height, body) {
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">
  <style>${sharedStyle}</style>
  ${body}
</svg>`;
}

function heroSvg({ profile, hero = {} }) {
  const lines = (hero.rotatingLines?.length ? hero.rotatingLines : [profile.headline]).slice(0, 4);
  const rotatingText = lines
    .map((line, index) => `<text class="rot-${index}" x="72" y="190" fill="${c.muted}" font-size="23"${index > 0 ? ' opacity="0"' : ""}>${esc(profile.displayName)} - ${esc(line)}</text>`)
    .join("");
  const snapshot = stats.snapshot;

  return shell(
    1200,
    236,
    `
  <rect width="1200" height="236" rx="28" fill="${c.page}"/>
  <rect x="1" y="1" width="1198" height="234" rx="27" fill="none" stroke="${c.border}"/>
  <text x="70" y="92" fill="${c.quiet}" font-size="15" font-weight="500">Profile</text>
  <text x="68" y="150" fill="${c.text}" font-size="56" font-weight="700">${esc(profile.username)}</text>
  ${rotatingText}
  <g class="rise" transform="translate(814 54)">
    <rect width="318" height="128" rx="24" fill="${c.card}" stroke="${c.hairline}"/>
    <text x="26" y="38" fill="${c.muted}" font-size="14" font-weight="500">GitHub signal</text>
    <circle class="pulse" cx="278" cy="32" r="6" fill="${c.accent}"/>
    <text x="26" y="81" fill="${c.text}" font-size="32" font-weight="700">${esc(snapshot.currentStreak)}</text>
    <text x="60" y="72" fill="${c.text}" font-size="15" font-weight="650">day streak</text>
    <text x="60" y="93" fill="${c.quiet}" font-size="12">${esc(snapshot.currentStreakRange)}</text>
    <path d="M158 54v46" stroke="${c.hairline}" stroke-width="1"/>
    <text x="184" y="81" fill="${c.text}" font-size="32" font-weight="700">${esc(snapshot.totalContributions)}</text>
    <text x="184" y="101" fill="${c.quiet}" font-size="12">contributions</text>
    <text x="26" y="114" fill="${c.quiet}" font-size="11">snapshot ${esc(snapshot.date)}</text>
  </g>`
  );
}

function badgeSvg(label, options = {}) {
  const width = options.width ?? 172;

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="38" viewBox="0 0 ${width} 38" role="img">
  <style>${sharedStyle}</style>
  <rect x="1" y="1" width="${width - 2}" height="36" rx="18" fill="${c.soft}" stroke="${c.hairline}"/>
  <text x="${width / 2}" y="24" fill="${c.text}" font-size="13" font-weight="650" text-anchor="middle">${esc(label)}</text>
</svg>`;
}

function visitorClockSvg({ snapshot }) {
  const counter = snapshot.visitorCounter ?? { label: "Visitors", value: 0, window: "sync pending" };
  const digits = String(counter.value).padStart(4, "0").split("");
  const digitWidth = 48;
  const gap = 8;
  const width = 356;
  const startX = 116;
  const cards = digits
    .map((digit, index) => {
      const x = startX + index * (digitWidth + gap);
      return `
  <g class="rise flip" style="animation-delay:${(index * 0.05).toFixed(2)}s" transform="translate(${x} 48)">
    <rect width="${digitWidth}" height="66" rx="12" fill="${c.card}" stroke="${c.border}"/>
    <path d="M0 33h${digitWidth}" stroke="${c.hairline}" stroke-width="1"/>
    <text x="${digitWidth / 2}" y="45" fill="${c.text}" font-size="34" font-weight="650" text-anchor="middle">${digit}</text>
  </g>`;
    })
    .join("");

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="132" viewBox="0 0 ${width} 132" role="img">
  <style>
    ${sharedStyle}
    .flip { transform-box: fill-box; transform-origin: center; animation-name: rise, flip; animation-duration: .55s, 6s; animation-timing-function: cubic-bezier(.2,.8,.2,1), cubic-bezier(.2,.8,.2,1); animation-iteration-count: 1, infinite; }
    @keyframes flip { 0%, 88%, 100% { transform: rotateX(0deg); } 94% { transform: rotateX(-10deg); } }
    @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
  </style>
  <rect width="${width}" height="132" rx="24" fill="${c.page}"/>
  <rect x="1" y="1" width="${width - 2}" height="130" rx="23" fill="none" stroke="${c.border}"/>
  <text x="28" y="62" fill="${c.muted}" font-size="14" font-weight="650">${esc(counter.label)}</text>
  <text x="28" y="86" fill="${c.quiet}" font-size="12">${esc(counter.window)}</text>
  ${cards}
</svg>`;
}

function systemMapSvg({ stack }) {
  const rows = stack
    .map((item, index) => {
      const y = 170 + index * 78;
      return `
  <g class="rise" style="animation-delay:${(index * 0.04).toFixed(2)}s">
    <rect x="76" y="${y - 42}" width="1048" height="64" rx="18" fill="${c.card}" stroke="${c.hairline}"/>
    <text x="104" y="${y - 4}" fill="${c.text}" font-size="20" font-weight="650">${esc(item.group)}</text>
    <text x="288" y="${y - 8}" fill="${c.muted}" font-size="15" font-weight="500">${esc(item.focus)}</text>
    <text x="288" y="${y + 13}" fill="${c.quiet}" font-size="13">${esc(item.detail)}</text>
    <text class="nudge" style="animation-delay:${(index * 0.16).toFixed(2)}s" x="1090" y="${y + 3}" fill="${c.quiet}" font-size="24" text-anchor="middle">›</text>
  </g>`;
    })
    .join("");

  return shell(
    1200,
    528,
    `
  <rect width="1200" height="528" rx="28" fill="${c.page}"/>
  <rect x="1" y="1" width="1198" height="526" rx="27" fill="none" stroke="${c.border}"/>
  <text x="76" y="82" fill="${c.text}" font-size="40" font-weight="700">Stack</text>
  <text x="76" y="112" fill="${c.muted}" font-size="17">Focused, practical, and built for real projects.</text>
  ${rows}`
  );
}

function statsSvg({ snapshot, contributions }) {
  const graph = { x: 94, y: 300, width: 1012, height: 205 };
  const maxValue = Math.max(20, ...contributions.map((item) => item.value));
  const point = (item, index) => {
    const x = graph.x + (index / (contributions.length - 1)) * graph.width;
    const y = graph.y + graph.height - (item.value / maxValue) * graph.height;
    return { x: Number(x.toFixed(2)), y: Number(y.toFixed(2)) };
  };
  const points = contributions.map(point);
  const linePath = points.map((item, index) => `${index === 0 ? "M" : "L"}${item.x} ${item.y}`).join(" ");
  const ticks = [0, 10, 20]
    .map((tick) => {
      const y = graph.y + graph.height - (tick / maxValue) * graph.height;
      return `
  <path d="M${graph.x} ${y}h${graph.width}" stroke="${c.hairline}" stroke-width="1"/>
  <text x="${graph.x - 18}" y="${y + 5}" fill="${c.quiet}" font-size="12" text-anchor="end">${tick}</text>`;
    })
    .join("");
  const labels = contributions
    .map((item, index) => {
      if (![0, 7, 15, 23, 30].includes(index)) return "";
      const x = graph.x + (index / (contributions.length - 1)) * graph.width;
      return `<text x="${x}" y="${graph.y + graph.height + 30}" fill="${c.quiet}" font-size="12" text-anchor="middle">${esc(item.label)}</text>`;
    })
    .join("");
  const dots = points
    .map((item, index) => `<circle class="point" style="animation-delay:${(0.38 + index * 0.018).toFixed(3)}s" cx="${item.x}" cy="${item.y}" r="3.5" fill="${c.text}"/>`)
    .join("");
  const statCards = [
    ["Total", snapshot.totalContributions, snapshot.contributionRange],
    ["Current", snapshot.currentStreak, snapshot.currentStreakRange],
    ["Best", snapshot.longestStreak, snapshot.longestStreakRange],
    ["Visitors", snapshot.visitorCounter?.value ?? 0, snapshot.visitorCounter?.window ?? "sync pending"]
  ]
    .map(([label, value, sub], index) => {
      const x = 76 + index * 270;
      return `
  <g class="rise" style="animation-delay:${(index * 0.04).toFixed(2)}s">
    <rect x="${x}" y="118" width="236" height="104" rx="22" fill="${c.card}" stroke="${c.hairline}"/>
    <text x="${x + 24}" y="162" fill="${c.text}" font-size="31" font-weight="700">${esc(value)}</text>
    <text x="${x + 24}" y="190" fill="${c.muted}" font-size="14" font-weight="600">${esc(label)}</text>
    <text x="${x + 24}" y="211" fill="${c.quiet}" font-size="12">${esc(sub)}</text>
  </g>`;
    })
    .join("");

  return shell(
    1200,
    620,
    `
  <rect width="1200" height="620" rx="28" fill="${c.page}"/>
  <rect x="1" y="1" width="1198" height="618" rx="27" fill="none" stroke="${c.border}"/>
  <text x="76" y="82" fill="${c.text}" font-size="40" font-weight="700">GitHub signal</text>
  <text x="76" y="112" fill="${c.muted}" font-size="16">${esc(snapshot.label)} - ${esc(snapshot.date)}</text>
  ${statCards}
  <text x="${graph.x}" y="${graph.y - 30}" fill="${c.text}" font-size="21" font-weight="650">Contribution rhythm</text>
  ${ticks}
  ${labels}
  <path d="${linePath}" fill="none" stroke="${c.text}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" opacity=".28"/>
  <path class="draw" d="${linePath}" fill="none" stroke="${c.text}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
  ${dots}
  <text x="${graph.x}" y="${graph.y + graph.height + 62}" fill="${c.quiet}" font-size="12">Synced through GitHub Actions and data/profile-stats.json</text>`
  );
}

function footerSvg() {
  return shell(
    1200,
    82,
    `
  <rect width="1200" height="82" rx="24" fill="${c.page}"/>
  <rect x="1" y="1" width="1198" height="80" rx="23" fill="none" stroke="${c.border}"/>
  <path d="M76 41h1048" stroke="${c.hairline}" stroke-width="1"/>
  <text x="600" y="34" fill="${c.quiet}" font-size="13" text-anchor="middle">Built from local files. Updated by GitHub.</text>`
  );
}

async function renderTheme(palette, suffix = "") {
  c = palette;
  const avatarSvg = await fetchAvatarSvg(config.profile.username);

  await Promise.all([
    writeAsset(`avatar${suffix}.svg`, avatarSvg),
    writeAsset(`hero${suffix}.svg`, heroSvg(config)),
    writeAsset(`system-map${suffix}.svg`, systemMapSvg(config)),
    writeAsset(`stats-panel${suffix}.svg`, statsSvg(stats)),
    writeAsset(`visitor-clock${suffix}.svg`, visitorClockSvg(stats)),
    writeAsset(`badge-studio${suffix}.svg`, badgeSvg("POKYH.STUDIO", { width: 166 })),
    writeAsset(`badge-github${suffix}.svg`, badgeSvg("GITHUB", { width: 132 })),
    writeAsset(`footer${suffix}.svg`, footerSvg())
  ]);
}

await renderTheme(palettes.dark);
await renderTheme(palettes.light, "-light");

console.log("README assets rendered.");
