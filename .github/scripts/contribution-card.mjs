// Builds a light and a dark SVG card that summarizes the contribution calendar:
// three headline numbers and a monthly bar chart for the last 12 months.
//
// Usage: GITHUB_TOKEN=... GITHUB_USER=... node contribution-card.mjs <output-dir>

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const login = process.env.GITHUB_USER;
const token = process.env.GITHUB_TOKEN;
const outDir = process.argv[2] ?? "dist";

if (!login || !token) {
  throw new Error("GITHUB_USER and GITHUB_TOKEN must be set");
}

const QUERY = `query ($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount } }
      }
    }
  }
}`;

async function fetchCalendar() {
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "profile-contribution-card",
    },
    body: JSON.stringify({ query: QUERY, variables: { login } }),
  });
  if (!response.ok) {
    throw new Error(`GraphQL request failed with HTTP ${response.status}`);
  }
  const body = await response.json();
  if (body.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(body.errors)}`);
  }
  return body.data.user.contributionsCollection.contributionCalendar;
}

function summarize(calendar) {
  const days = calendar.weeks.flatMap((week) => week.contributionDays);
  const lastDate = days.at(-1).date;
  const [lastYear, lastMonth] = lastDate.split("-").map(Number);

  const months = [];
  for (let offset = 11; offset >= 0; offset--) {
    const first = new Date(Date.UTC(lastYear, lastMonth - 1 - offset, 1));
    months.push({
      key: first.toISOString().slice(0, 7),
      label: first.toLocaleString("en-US", { month: "short", timeZone: "UTC" }),
      count: 0,
    });
  }
  const monthByKey = new Map(months.map((month) => [month.key, month]));
  for (const day of days) {
    const month = monthByKey.get(day.date.slice(0, 7));
    if (month) month.count += day.contributionCount;
  }

  return {
    total: calendar.totalContributions,
    thisMonth: months.at(-1).count,
    activeDays: days.filter((day) => day.contributionCount > 0).length,
    months,
    updated: new Date(`${lastDate}T00:00:00Z`).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }),
  };
}

const THEMES = {
  light: {
    background: "#f6f8fa",
    border: "#d1d9e0",
    text: "#1f2328",
    muted: "#59636e",
    divider: "#d1d9e0",
    empty: "#d1d9e0",
  },
  dark: {
    background: "#151b23",
    border: "#3d444d",
    text: "#f0f6fc",
    muted: "#9198a1",
    divider: "#3d444d",
    empty: "#3d444d",
  },
};

const WIDTH = 520;
const HEIGHT = 270;
const PAD = 20;
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif";

function formatNumber(value) {
  return value.toLocaleString("en-US");
}

function renderCard(summary, theme) {
  const stats = [
    { value: summary.total, label: "Last 12 months" },
    { value: summary.thisMonth, label: "This month" },
    { value: summary.activeDays, label: "Active days" },
  ];
  const statWidth = (WIDTH - PAD * 2) / stats.length;
  const statsSvg = stats
    .map((stat, index) => {
      const x = PAD + statWidth * index;
      return `
    <g class="fade" style="animation-delay:${index * 80}ms">
      <text x="${x}" y="58" class="stat">${formatNumber(stat.value)}</text>
      <text x="${x}" y="80" class="label">${stat.label}</text>
    </g>`;
    })
    .join("");

  const baseline = 232;
  const maxBarHeight = 70;
  const slot = (WIDTH - PAD * 2) / summary.months.length;
  const barWidth = 22;
  const maxCount = Math.max(1, ...summary.months.map((month) => month.count));
  const barsSvg = summary.months
    .map((month, index) => {
      const centerX = PAD + slot * index + slot / 2;
      const isCurrent = index === summary.months.length - 1;
      const monthLabel = `<text x="${centerX}" y="${baseline + 20}" class="month${isCurrent ? " current" : ""}">${month.label}</text>`;
      if (month.count === 0) {
        return `
    <rect x="${centerX - barWidth / 2}" y="${baseline - 2}" width="${barWidth}" height="2" rx="1" fill="${theme.empty}"/>
    ${monthLabel}`;
      }
      const height = Math.max(4, Math.round((month.count / maxCount) * maxBarHeight));
      return `
    <rect x="${centerX - barWidth / 2}" y="${baseline - height}" width="${barWidth}" height="${height}" rx="${Math.min(5, height / 2)}" fill="url(#bar)" class="bar" style="animation-delay:${index * 40}ms"/>
    <text x="${centerX}" y="${baseline - height - 6}" class="value fade" style="animation-delay:${300 + index * 40}ms">${formatNumber(month.count)}</text>
    ${monthLabel}`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-labelledby="title">
  <title id="title">${formatNumber(summary.total)} contributions in the last 12 months, ${formatNumber(summary.thisMonth)} this month, ${formatNumber(summary.activeDays)} active days</title>
  <defs>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#6A3DE8"/>
      <stop offset="1" stop-color="#0B7BD8"/>
    </linearGradient>
    <linearGradient id="bar" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="#0B7BD8"/>
      <stop offset="1" stop-color="#6A3DE8"/>
    </linearGradient>
  </defs>
  <style>
    text { font-family: ${FONT}; }
    .stat { font-size: 30px; font-weight: 700; fill: url(#accent); }
    .label { font-size: 14px; fill: ${theme.muted}; }
    .caption { font-size: 14px; font-weight: 600; fill: ${theme.text}; }
    .updated { font-size: 12px; fill: ${theme.muted}; text-anchor: end; }
    .value { font-size: 12px; fill: ${theme.muted}; text-anchor: middle; }
    .month { font-size: 13px; fill: ${theme.muted}; text-anchor: middle; }
    .month.current { fill: ${theme.text}; font-weight: 600; }
    .bar { transform-box: fill-box; transform-origin: bottom; animation: grow 700ms cubic-bezier(.2,.8,.2,1) both; }
    .fade { animation: fade 600ms ease-out both; }
    @keyframes grow { from { transform: scaleY(0); } to { transform: scaleY(1); } }
    @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
  </style>
  <rect x="0.5" y="0.5" width="${WIDTH - 1}" height="${HEIGHT - 1}" rx="12" fill="${theme.background}" stroke="${theme.border}"/>
  ${statsSvg}
  <line x1="${PAD}" y1="104" x2="${WIDTH - PAD}" y2="104" stroke="${theme.divider}"/>
  <text x="${PAD}" y="128" class="caption">Monthly contributions</text>
  <text x="${WIDTH - PAD}" y="128" class="updated">Updated ${summary.updated}</text>
  ${barsSvg}
</svg>
`;
}

const summary = summarize(await fetchCalendar());
mkdirSync(outDir, { recursive: true });
for (const [name, theme] of Object.entries(THEMES)) {
  writeFileSync(join(outDir, `contributions-${name}.svg`), renderCard(summary, theme));
}
console.log(
  `Wrote cards: total=${summary.total} thisMonth=${summary.thisMonth} activeDays=${summary.activeDays}`,
);
