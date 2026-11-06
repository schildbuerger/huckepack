// The months a climate rating is read for (issue #114): without a pick, a trail's best run of at
// least two consecutive season months; with a pick (the URL's `months`, the same parameter as the
// search's When filter), the months picked. Pure functions, used at build time and in the browser
// (months in the URL re-rate every difficulty on the page, Base.astro; nothing is stored).

export const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ALL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const next = (m: number) => (m % 12) + 1;

// the best run: of every run of at least two consecutive season months (across the new year too),
// the one whose hardest month is easiest; on a tie the longest, then the earliest in the season's
// order. A one-month season is its month.
export function bestRun(levels: number[], season: number[]): number[] {
  const months = season.length ? season : ALL;
  const inSeason = new Set(months);
  if (inSeason.size <= 1) return [...inSeason];
  let best: { max: number; run: number[] } | null = null;
  for (const start of months) {
    const run = [start];
    while (run.length < inSeason.size && inSeason.has(next(run[run.length - 1]))) {
      run.push(next(run[run.length - 1]));
      const max = Math.max(...run.map((m) => levels[m - 1]));
      if (!best || max < best.max || (max === best.max && run.length > best.run.length)) best = { max, run: [...run] };
    }
  }
  return best?.run ?? [...inSeason];
}

// the climate level for the pick (or the default run): the hardest of its months; `worst` is the
// season's hardest month, `out` the picked months outside the season
export function climateFor(levels: number[], season: number[], pick: number[] = []) {
  const s = season.length ? season : ALL;
  const months = pick.length ? [...pick] : bestRun(levels, s);
  return {
    months,
    picked: pick.length > 0,
    level: Math.max(...months.map((m) => levels[m - 1])),
    worst: Math.max(...s.map((m) => levels[m - 1])),
    out: pick.filter((m) => !s.includes(m)),
  };
}

// months as words: a run "Aug–Sep" (also across the new year, "Nov–Feb"), "all year", else a list
export function monthsText(ms: number[]): string {
  if (!ms.length) return "";
  if (ms.length === 12) return "all year";
  const set = new Set(ms);
  const start = ms.find((m) => !set.has(m === 1 ? 12 : m - 1));
  if (start !== undefined) {
    const run = [start];
    while (set.has(next(run[run.length - 1])) && run.length < ms.length) run.push(next(run[run.length - 1]));
    if (run.length === ms.length) return run.length === 1 ? MONTH_ABBR[run[0] - 1] : `${MONTH_ABBR[run[0] - 1]}–${MONTH_ABBR[run[run.length - 1] - 1]}`;
  }
  // several runs (a season in spring and autumn, the Arizona Trail's): each run as a range, a run of
  // one or two months by its months ("Feb–May, Sep–Nov"), in calendar order from a run's start
  const starts = [...ms].sort((a, b) => a - b).filter((m) => !set.has(m === 1 ? 12 : m - 1));
  return starts
    .map((s) => {
      const run = [s];
      while (set.has(next(run[run.length - 1])) && run.length < 12) run.push(next(run[run.length - 1]));
      return run.length > 2 ? `${MONTH_ABBR[run[0] - 1]}–${MONTH_ABBR[run[run.length - 1] - 1]}` : run.map((m) => MONTH_ABBR[m - 1]).join(", ");
    })
    .join(", ");
}

// the pick in a URL's query: months=7,8 (the search's When filter), else none
export const readPick = (search: string): number[] =>
  (new URLSearchParams(search).get("months") ?? "")
    .split(",")
    .map(Number)
    .filter((m) => m >= 1 && m <= 12);

// a run between two months, in calendar order across the new year: the header's grid picks one
// month, then a second for the run from the first to it
export function runBetween(a: number, b: number): number[] {
  const run = [a];
  while (run[run.length - 1] !== b) run.push(next(run[run.length - 1]));
  return run;
}

// A difficulty display re-rated in the browser for a month pick: the element carries
// data-rate="terrain,effort|levels|season" (levels: 12 digits, January first; season: months),
// and holds a climate bar (.diff-col[data-dim=climate] with .diff-bar.range and .diff-bar.lv), the
// overall word (.rate-word), optionally the screen-reader line (.rate-sr) and the months it's
// for (.rate-for). Rendered at build time for the default; Base.astro calls rerate() with a pick.
const WORDS = ["Easy", "Moderate", "Demanding", "Hard"];

export const rateData = (terrain: number | null, effort: number | null, levels: number[], season: number[] | null) =>
  `${terrain ?? 0},${effort ?? 0}|${levels.join("")}|${(season ?? []).join(",")}`;

export function rerate(root: ParentNode, pick: number[]) {
  for (const el of root.querySelectorAll<HTMLElement>("[data-rate]")) {
    const [te, lv, se] = el.dataset.rate!.split("|");
    if (!lv) continue;
    const [terrain, effort] = te.split(",").map(Number);
    const levels = [...lv].map(Number);
    const season = se ? se.split(",").map(Number) : [];
    const c = climateFor(levels, season, pick);
    const overall = Math.max(terrain, effort, c.level);
    const col = el.querySelector<HTMLElement>('[data-dim="climate"]');
    const words = `${WORDS[c.level - 1]} ${c.picked ? "for" : "in"} ${monthsText(c.months)}`;
    if (col) {
      col.querySelector<HTMLElement>(".range")!.style.height = `${(c.picked ? c.level : c.worst) * 25}%`;
      col.querySelector<HTMLElement>(".lv")!.style.height = `${c.level * 25}%`;
      col.title = `Climate: ${words}`;
    }
    const word = el.querySelector(".rate-word");
    if (word) word.textContent = WORDS[overall - 1];
    const sr = el.querySelector(".rate-sr");
    if (sr)
      sr.textContent = `${[terrain && `Terrain: ${WORDS[terrain - 1]}`, `Climate: ${words}`, effort && `Effort: ${WORDS[effort - 1]}`].filter(Boolean).join("; ")}. Overall: `;
    const forEl = el.querySelector(".rate-for");
    if (forEl) forEl.textContent = c.out.length ? `outside the season in ${monthsText(c.out)}` : `${c.picked ? "for" : "in"} ${monthsText(c.months)}`;
  }
}
