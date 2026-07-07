import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configPath = path.join(root, "data", "profile-config.json");
const statsPath = path.join(root, "data", "profile-stats.json");

const config = JSON.parse(await readFile(configPath, "utf8"));
const existingStats = JSON.parse(await readFile(statsPath, "utf8"));

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const trafficToken = process.env.PROFILE_TRAFFIC_TOKEN || token;
const owner = process.env.PROFILE_OWNER || config.profile.username;
const repo = process.env.PROFILE_REPO || config.profile.username;
const since = process.env.PROFILE_STATS_SINCE || config.statsSince;
const today = process.env.PROFILE_STATS_TO ? new Date(`${process.env.PROFILE_STATS_TO}T12:00:00.000Z`) : new Date();
const todayDate = today.toISOString().slice(0, 10);

const shortDate = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric"
});

const longDate = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric"
});

const authHeaders = token
  ? {
      Authorization: `Bearer ${token}`
    }
  : {};

function formatRange(start, end) {
  if (!start || !end) return "No active streak";
  return `${shortDate.format(new Date(`${start}T00:00:00Z`))} - ${shortDate.format(new Date(`${end}T00:00:00Z`))}`;
}

function formatContributionRange(start) {
  return `${longDate.format(new Date(`${start}T00:00:00Z`))} - Present`;
}

function normalizeDay(day) {
  return {
    date: day.date,
    label: shortDate.format(new Date(`${day.date}T00:00:00Z`)),
    value: Number(day.contributionCount ?? day.value ?? 0)
  };
}

function calculateStreaks(days) {
  let current = 0;
  let currentStart = null;
  let currentEnd = null;
  let longest = 0;
  let longestStart = null;
  let longestEnd = null;
  let run = 0;
  let runStart = null;

  for (const day of days) {
    if (day.value > 0) {
      run += 1;
      runStart ||= day.date;
      if (run > longest) {
        longest = run;
        longestStart = runStart;
        longestEnd = day.date;
      }
    } else {
      run = 0;
      runStart = null;
    }
  }

  for (let index = days.length - 1; index >= 0; index -= 1) {
    const day = days[index];
    if (day.value <= 0) {
      if (current === 0) continue;
      break;
    }
    current += 1;
    currentStart = day.date;
    currentEnd ||= day.date;
  }

  return {
    current,
    currentRange: formatRange(currentStart, currentEnd),
    longest,
    longestRange: formatRange(longestStart, longestEnd)
  };
}

async function githubGraphql(query, variables) {
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      ...authHeaders,
      "Content-Type": "application/json",
      "User-Agent": "plattnericus-readme-sync"
    },
    body: JSON.stringify({ query, variables })
  });

  const body = await response.json();
  if (!response.ok || body.errors?.length) {
    const message = body.errors?.map((error) => error.message).join("; ") || response.statusText;
    throw new Error(`GitHub GraphQL failed: ${message}`);
  }

  return body.data;
}

async function githubRest(url) {
  if (!trafficToken) return null;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${trafficToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "plattnericus-readme-sync"
    }
  });

  if (!response.ok) {
    return null;
  }

  return response.json();
}

async function fetchWithGitHubHeaders(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "plattnericus-readme-sync",
      Accept: "text/html"
    }
  });

  if (!response.ok) {
    throw new Error(`GitHub public calendar failed: ${response.status}`);
  }

  return response.text();
}

function readAttribute(tag, name) {
  const match = tag.match(new RegExp(`${name}="([^"]+)"`));
  return match?.[1] ?? null;
}

function tooltipCount(text) {
  if (/No contributions/i.test(text)) return 0;
  const match = text.match(/([0-9,]+)\s+contributions?/i);
  return match ? Number(match[1].replaceAll(",", "")) : 0;
}

function parsePublicContributionHtml(html) {
  const daysById = new Map();
  const tooltipsById = new Map();
  const dayPattern = /<td\b[^>]*ContributionCalendar-day[^>]*>/g;
  const tooltipPattern = /<tool-tip\b[^>]*for="([^"]+)"[^>]*>([^<]*)<\/tool-tip>/g;

  for (const match of html.matchAll(dayPattern)) {
    const tag = match[0];
    const date = readAttribute(tag, "data-date");
    const id = readAttribute(tag, "id");

    if (date && id) {
      daysById.set(id, { date, contributionCount: 0 });
    }
  }

  for (const match of html.matchAll(tooltipPattern)) {
    tooltipsById.set(match[1], tooltipCount(match[2]));
  }

  return [...daysById.entries()].map(([id, day]) => ({
    date: day.date,
    contributionCount: tooltipsById.get(id) ?? 0
  }));
}

function yearsBetween(startDate, endDate) {
  const startYear = Number(startDate.slice(0, 4));
  const endYear = Number(endDate.slice(0, 4));
  return Array.from({ length: endYear - startYear + 1 }, (_, index) => startYear + index);
}

async function publicContributionDays() {
  const allDays = [];

  for (const year of yearsBetween(since, todayDate)) {
    const html = await fetchWithGitHubHeaders(
      `https://github.com/users/${encodeURIComponent(owner)}/contributions?from=${year}-01-01&to=${year}-12-31`
    );
    allDays.push(...parsePublicContributionHtml(html));
  }

  const byDate = new Map();
  for (const day of allDays) {
    if (day.date >= since && day.date <= todayDate) {
      byDate.set(day.date, normalizeDay(day));
    }
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

async function graphQlContributionDays() {
  const query = `
    query ProfileStats($login: String!, $from: DateTime!, $to: DateTime!) {
      user(login: $login) {
        contributionsCollection(from: $from, to: $to) {
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays {
                date
                contributionCount
              }
            }
          }
        }
      }
    }
  `;

  const data = await githubGraphql(query, {
    login: owner,
    from: new Date(`${since}T00:00:00.000Z`).toISOString(),
    to: today.toISOString()
  });

  const calendar = data.user.contributionsCollection.contributionCalendar;
  const days = calendar.weeks
    .flatMap((week) => week.contributionDays)
    .map(normalizeDay)
    .filter((day) => day.date >= since && day.date <= todayDate)
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    days,
    totalContributions: calendar.totalContributions,
    source: "github-api",
    label: "GitHub API snapshot"
  };
}

async function syncedContributionDays() {
  if (token) {
    try {
      return await graphQlContributionDays();
    } catch (error) {
      console.warn(`${error.message}. Falling back to public GitHub calendar.`);
    }
  }

  const days = await publicContributionDays();
  return {
    days,
    totalContributions: days.reduce((sum, day) => sum + day.value, 0),
    source: "github-public-calendar",
    label: "GitHub public snapshot"
  };
}

function trafficFallback() {
  const previousCounter = existingStats.snapshot?.visitorCounter;

  if (previousCounter?.source && previousCounter.source !== "local-fallback") {
    return {
      ...previousCounter,
      source: "github-repo-traffic-unavailable"
    };
  }

  return {
    label: "VISITORS",
    value: "SYNC",
    window: "GitHub traffic API",
    source: "github-repo-traffic-pending"
  };
}

const contributionData = await syncedContributionDays();
const traffic = await githubRest(`https://api.github.com/repos/${owner}/${repo}/traffic/views`);
const days = contributionData.days;

if (!days.length) {
  throw new Error("No contribution days were returned by GitHub.");
}

const streaks = calculateStreaks(days);
const visitorCounter = traffic
  ? {
      label: "VISITORS",
      value: traffic.count,
      window: "last 14 days",
      source: "github-repo-traffic",
      uniques: traffic.uniques
    }
  : trafficFallback();

const updatedStats = {
  generatedAt: today.toISOString(),
  source: contributionData.source,
  snapshot: {
    date: todayDate,
    label: contributionData.label,
    totalContributions: contributionData.totalContributions,
    contributionRange: formatContributionRange(since),
    currentStreak: streaks.current,
    currentStreakRange: streaks.currentRange,
    longestStreak: streaks.longest,
    longestStreakRange: streaks.longestRange,
    visitorCounter
  },
  contributions: days.slice(-31)
};

await writeFile(statsPath, `${JSON.stringify(updatedStats, null, 2)}\n`, "utf8");
console.log(`Profile stats synced from ${contributionData.source}.`);
