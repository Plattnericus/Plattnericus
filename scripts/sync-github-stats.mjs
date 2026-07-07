import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configPath = path.join(root, "data", "profile-config.json");
const statsPath = path.join(root, "data", "profile-stats.json");

const config = JSON.parse(await readFile(configPath, "utf8"));
const existingStats = JSON.parse(await readFile(statsPath, "utf8"));

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const owner = process.env.PROFILE_OWNER || config.profile.username;
const repo = process.env.PROFILE_REPO || config.profile.username;
const since = process.env.PROFILE_STATS_SINCE || config.statsSince;

if (!token) {
  console.log("No GitHub token found. Keeping the local fallback snapshot.");
  process.exit(0);
}

const headers = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
  "User-Agent": "plattnericus-readme-sync"
};

const today = new Date();
const from = new Date(`${since}T00:00:00.000Z`);

const shortDate = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric"
});

const longDate = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric"
});

function formatRange(start, end) {
  if (!start || !end) return "No active streak";
  return `${shortDate.format(new Date(`${start}T00:00:00Z`))} - ${shortDate.format(new Date(`${end}T00:00:00Z`))}`;
}

function formatContributionRange(start) {
  return `${longDate.format(new Date(`${start}T00:00:00Z`))} - Present`;
}

async function githubGraphql(query, variables) {
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers,
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
  const response = await fetch(url, {
    headers: {
      ...headers,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    }
  });

  if (!response.ok) {
    return null;
  }

  return response.json();
}

function normalizeDay(day) {
  return {
    date: day.date,
    label: shortDate.format(new Date(`${day.date}T00:00:00Z`)),
    value: day.contributionCount
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
  from: from.toISOString(),
  to: today.toISOString()
});

const calendar = data.user.contributionsCollection.contributionCalendar;
const allDays = calendar.weeks.flatMap((week) => week.contributionDays).map(normalizeDay);
const visibleDays = allDays.slice(-31);
const streaks = calculateStreaks(allDays);
const traffic = await githubRest(`https://api.github.com/repos/${owner}/${repo}/traffic/views`);
const previousCounter = existingStats.snapshot.visitorCounter;

const visitorCounter = traffic
  ? {
      label: "VISITORS",
      value: traffic.count,
      window: "last 14 days",
      source: "github-repo-traffic",
      uniques: traffic.uniques
    }
  : {
      ...previousCounter,
      source: previousCounter.source === "local-fallback" ? "local-fallback" : "github-repo-traffic-unavailable"
    };

const updatedStats = {
  generatedAt: today.toISOString(),
  source: "github-api",
  snapshot: {
    date: today.toISOString().slice(0, 10),
    label: "GitHub API snapshot",
    totalContributions: calendar.totalContributions,
    contributionRange: formatContributionRange(since),
    currentStreak: streaks.current,
    currentStreakRange: streaks.currentRange,
    longestStreak: streaks.longest,
    longestStreakRange: streaks.longestRange,
    visitorCounter
  },
  contributions: visibleDays
};

await writeFile(statsPath, `${JSON.stringify(updatedStats, null, 2)}\n`, "utf8");
console.log("Profile stats synced from GitHub.");
