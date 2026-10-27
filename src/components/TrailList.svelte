<script lang="ts">
  // The trail search: filters grouped by planning question (when, how long, how hard, where,
  // sleeping, water and terrain) beside a list of result cards. Everything runs in the browser
  // on the summaries built at build time; the filters live in the URL, so a search can be shared.
  import { onMount } from "svelte";
  import { SLEEPING_CATEGORIES, WATER_LEVELS, type TrailSummary } from "../lib/trails";

  let { trails, eleRange }: { trails: TrailSummary[]; eleRange: [number, number] } = $props();

  const SAC = ["T1", "T2", "T3", "T4", "T5", "T6"];
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const DURATIONS = [
    { id: "week", label: "Up to a week", min: 1, max: 7 },
    { id: "two-weeks", label: "1–2 weeks", min: 8, max: 14 },
    { id: "month", label: "2–4 weeks", min: 15, max: 28 },
    { id: "long", label: "Over 4 weeks", min: 29, max: Infinity },
  ];
  const NATURAL_SHARE = 0.6; // "mostly natural paths"
  const SORTS = {
    name: { label: "Name", value: (t: TrailSummary) => t.name },
    shortest: { label: "Shortest first", value: (t: TrailSummary) => t.lengthKm },
    longest: { label: "Longest first", value: (t: TrailSummary) => (t.lengthKm === null ? null : -t.lengthKm) },
    days: { label: "Fewest days", value: (t: TrailSummary) => t.days?.[0] ?? null },
    easiest: { label: "Easiest first", value: (t: TrailSummary) => (t.sac === null ? null : SAC.indexOf(t.sac)) },
    flattest: {
      label: "Least climbing per km",
      value: (t: TrailSummary) => (t.ascentM === null || !t.lengthKm ? null : t.ascentM / t.lengthKm),
    },
    natural: { label: "Most natural ground", value: (t: TrailSummary) => (t.surface ? -t.surface.natural : null) },
  } as const;
  type SortKey = keyof typeof SORTS;

  // filter state; every field maps to a URL parameter of the same name
  let q = $state("");
  let months = $state<number[]>([]);
  let durations = $state<string[]>([]);
  let sac = $state("");
  let where = $state("");
  let sleep = $state<string[]>([]);
  let wild = $state("");
  let water = $state("");
  let natural = $state(false);
  let sort = $state<SortKey>("name");
  let filtersOpen = $state(false);
  let ready = false;

  const uniq = (xs: string[]) => [...new Set(xs)].sort((a, b) => a.localeCompare(b));
  // where: continents, each with the countries trails cross there
  const places = uniq(trails.flatMap((t) => t.continents)).map((c) => ({
    continent: c,
    countries: uniq(trails.filter((t) => t.continents.includes(c)).flatMap((t) => t.countries)),
  }));
  const sleepingOptions = SLEEPING_CATEGORIES.filter((c) => c.id !== "wild-camping");

  onMount(() => {
    const p = new URLSearchParams(location.search);
    const list = (k: string) => (p.get(k) ? p.get(k)!.split(",") : []);
    q = p.get("q") ?? "";
    months = list("months").map(Number).filter((m) => m >= 1 && m <= 12);
    durations = list("durations").filter((d) => DURATIONS.some((x) => x.id === d));
    sac = SAC.includes(p.get("sac") ?? "") ? p.get("sac")! : "";
    where = p.get("where") ?? "";
    sleep = list("sleep").filter((s) => sleepingOptions.some((c) => c.id === s));
    wild = ["allowed", "some"].includes(p.get("wild") ?? "") ? p.get("wild")! : "";
    water = ["frequent", "regular"].includes(p.get("water") ?? "") ? p.get("water")! : "";
    natural = p.get("natural") === "1";
    sort = (p.get("sort") ?? "") in SORTS ? (p.get("sort") as SortKey) : "name";
    ready = true;
  });

  // keep the URL in step with the filters (replace, not push: the back button leaves the page)
  $effect(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (months.length) p.set("months", [...months].sort((a, b) => a - b).join(","));
    if (durations.length) p.set("durations", durations.join(","));
    if (sac) p.set("sac", sac);
    if (where) p.set("where", where);
    if (sleep.length) p.set("sleep", sleep.join(","));
    if (wild) p.set("wild", wild);
    if (water) p.set("water", water);
    if (natural) p.set("natural", "1");
    if (sort !== "name") p.set("sort", sort);
    if (!ready) return;
    const search = p.toString();
    history.replaceState(null, "", search ? `?${search}` : location.pathname);
  });

  const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);

  const text = (t: TrailSummary) =>
    [t.name, t.localName ?? "", ...t.aliases, ...t.countries, ...t.regions, ...t.tags, t.start, t.end].join(" ").toLowerCase();

  const passes = (t: TrailSummary) => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length && !words.every((w) => text(t).includes(w))) return false;
    if (months.length && !(t.season && months.some((m) => t.season!.includes(m)))) return false;
    if (durations.length) {
      if (!t.days) return false;
      const [lo, hi] = t.days;
      if (!durations.some((id) => DURATIONS.some((d) => d.id === id && lo <= d.max && hi >= d.min))) return false;
    }
    if (sac && (t.sac === null || SAC.indexOf(t.sac) > SAC.indexOf(sac))) return false;
    if (where && !t.continents.includes(where) && !t.countries.includes(where)) return false;
    if (sleep.length && !sleep.every((s) => t.sleeping.includes(s))) return false;
    if (wild === "allowed" && t.wildCamping !== "allowed") return false;
    if (wild === "some" && t.wildCamping !== "allowed" && t.wildCamping !== "restricted") return false;
    if (water === "frequent" && t.water?.level !== "frequent") return false;
    if (water === "regular" && t.water?.level !== "frequent" && t.water?.level !== "regular") return false;
    if (natural && !(t.surface && t.surface.natural >= NATURAL_SHARE)) return false;
    return true;
  };

  let shown = $derived(
    trails.filter(passes).sort((a, b) => {
      const [x, y] = [SORTS[sort].value(a), SORTS[sort].value(b)];
      if (x === y) return a.name.localeCompare(b.name);
      if (x === null) return 1; // unknown values last
      if (y === null) return -1;
      return typeof x === "string" ? x.localeCompare(y as string) : x - (y as number);
    }),
  );

  // the active filters as removable chips
  const monthList = (ms: number[]) => [...ms].sort((a, b) => a - b).map((m) => MONTHS[m - 1]).join(", ");
  let active = $derived(
    [
      q.trim() && { label: `“${q.trim()}”`, clear: () => (q = "") },
      months.length && { label: monthList(months), clear: () => (months = []) },
      ...durations.map((id) => ({ label: DURATIONS.find((d) => d.id === id)!.label, clear: () => (durations = toggle(durations, id)) })),
      sac && { label: `Up to SAC ${sac}`, clear: () => (sac = "") },
      where && { label: where, clear: () => (where = "") },
      ...sleep.map((id) => ({ label: SLEEPING_CATEGORIES.find((c) => c.id === id)!.label, clear: () => (sleep = toggle(sleep, id)) })),
      wild && { label: wild === "allowed" ? "Wild camping allowed" : "Wild camping possible", clear: () => (wild = "") },
      water && { label: water === "frequent" ? "Frequent water" : "Regular water or better", clear: () => (water = "") },
      natural && { label: "Mostly natural paths", clear: () => (natural = false) },
    ].filter(Boolean) as { label: string; clear: () => void }[],
  );

  function reset() {
    q = where = sac = wild = water = "";
    months = [];
    durations = [];
    sleep = [];
    natural = false;
  }

  // card helpers
  const fmt = (n: number) => n.toLocaleString("en");
  const dayText = (d: [number, number]) => (d[0] === d[1] ? `${d[0]}` : `${d[0]}–${d[1]}`);
  const seasonText = (ms: number[]) => {
    const s = [...ms].sort((a, b) => a - b);
    return s.length === 12 ? "All year" : s.map((m) => MONTHS[m - 1]).join(", ");
  };
  const W = 240;
  const H = 56;
  const sparkPath = (profile: [number, number][], area: boolean) => {
    const total = profile.at(-1)![0] || 1;
    const [lo, hi] = eleRange;
    const pts = profile.map(([km, m]) => `${((km / total) * W).toFixed(1)},${(H - ((m - lo) / (hi - lo)) * (H - 4)).toFixed(1)}`);
    return area ? `M0,${H}L${pts.join("L")}L${W},${H}Z` : `M${pts.join("L")}`;
  };
  const sleepText = (t: TrailSummary) =>
    SLEEPING_CATEGORIES.filter((c) => c.id !== "wild-camping" && t.sleeping.includes(c.id))
      .map((c) => c.label)
      .join(" · ");
  const WILD = { allowed: "Wild camping allowed", restricted: "Wild camping restricted", prohibited: "No wild camping" };
  const WATER_WORD = Object.fromEntries(WATER_LEVELS.map((l) => [l.id, l.label]));
  const SHAPE = { frequent: "full", regular: "half", scarce: "blocked", allowed: "full", restricted: "half", prohibited: "blocked" } as const;
  const TONE = { frequent: "good", regular: "fair", scarce: "poor", allowed: "good", restricted: "fair", prohibited: "poor" } as const;
</script>

<div class="layout">
  <aside class="filters" class:open={filtersOpen} aria-label="Filters">
    <div class="filters-head">
      <h2>Filters</h2>
      {#if active.length}<button type="button" class="link" onclick={reset}>Clear all</button>{/if}
      <button type="button" class="close" onclick={() => (filtersOpen = false)}>Show {shown.length} {shown.length === 1 ? "trail" : "trails"}</button>
    </div>

    <fieldset>
      <legend>When do you want to go?</legend>
      <div class="months">
        {#each MONTHS as m, i}
          <button type="button" class="chip" aria-pressed={months.includes(i + 1)} onclick={() => (months = toggle(months, i + 1))}>{m}</button>
        {/each}
      </div>
      <p class="hint">Trails whose season includes any of these months.</p>
    </fieldset>

    <fieldset>
      <legend>How long?</legend>
      <div class="chips">
        {#each DURATIONS as d}
          <button type="button" class="chip" aria-pressed={durations.includes(d.id)} onclick={() => (durations = toggle(durations, d.id))}>{d.label}</button>
        {/each}
      </div>
    </fieldset>

    <fieldset>
      <legend>How hard, at most?</legend>
      <div class="scale" role="radiogroup" aria-label="Highest SAC grade">
        {#each SAC as s}
          <button type="button" class="chip" role="radio" aria-checked={sac === s} onclick={() => (sac = sac === s ? "" : s)}>{s}</button>
        {/each}
      </div>
      <p class="hint">SAC hiking scale, T1 easy to T6 very hard.{#if sac} Trails without a grade are left out.{/if}</p>
    </fieldset>

    <fieldset>
      <legend>Where?</legend>
      <select bind:value={where} aria-label="Continent or country">
        <option value="">Anywhere</option>
        {#each places as p}
          <optgroup label={p.continent}>
            <option value={p.continent}>All of {p.continent}</option>
            {#each p.countries as c}<option value={c}>{c}</option>{/each}
          </optgroup>
        {/each}
      </select>
    </fieldset>

    <fieldset>
      <legend>Where to sleep</legend>
      <div class="chips">
        {#each sleepingOptions as c}
          <button type="button" class="chip" aria-pressed={sleep.includes(c.id)} onclick={() => (sleep = toggle(sleep, c.id))}>{c.label}</button>
        {/each}
      </div>
      <p class="sub" id="wild-label">Wild camping</p>
      <div class="segmented" role="radiogroup" aria-labelledby="wild-label">
        <button type="button" role="radio" aria-checked={wild === ""} onclick={() => (wild = "")}>Any</button>
        <button type="button" role="radio" aria-checked={wild === "some"} onclick={() => (wild = "some")}>Possible</button>
        <button type="button" role="radio" aria-checked={wild === "allowed"} onclick={() => (wild = "allowed")}>Allowed</button>
      </div>
      <p class="hint">"Possible" includes trails where it's restricted to certain places.</p>
    </fieldset>

    <fieldset>
      <legend>Water and terrain</legend>
      <p class="sub first" id="water-label">Drinking water at least every</p>
      <div class="segmented" role="radiogroup" aria-labelledby="water-label">
        <button type="button" role="radio" aria-checked={water === ""} onclick={() => (water = "")}>Any</button>
        <button type="button" role="radio" aria-checked={water === "regular"} onclick={() => (water = "regular")}>20 km</button>
        <button type="button" role="radio" aria-checked={water === "frequent"} onclick={() => (water = "frequent")}>10 km</button>
      </div>
      <label class="check">
        <input type="checkbox" bind:checked={natural} />
        Mostly natural paths ({Math.round(NATURAL_SHARE * 100)} %+)
      </label>
    </fieldset>
  </aside>

  <div class="results">
    <div class="search">
      <input type="search" placeholder="Search by name, country, region or town…" bind:value={q} aria-label="Search trails" />
      <button type="button" class="filters-toggle" onclick={() => (filtersOpen = true)}>
        Filters{#if active.length}<span class="count-badge">{active.length}</span>{/if}
      </button>
    </div>

    <div class="bar">
      <p class="count" role="status">
        {#if active.length}<strong>{shown.length}</strong> of {trails.length} {trails.length === 1 ? "trail" : "trails"}
        {:else}<strong>{trails.length}</strong> {trails.length === 1 ? "trail" : "trails"}{/if}
      </p>
      <label class="sort">
        Sort
        <select bind:value={sort}>
          {#each Object.entries(SORTS) as [key, s]}<option value={key}>{s.label}</option>{/each}
        </select>
      </label>
    </div>

    {#if active.length}
      <ul class="active">
        {#each active as f}
          <li><button type="button" onclick={f.clear} aria-label={`Remove filter: ${f.label}`}>{f.label}<span aria-hidden="true">×</span></button></li>
        {/each}
      </ul>
    {/if}

    {#if shown.length}
      <ol class="cards">
        {#each shown as t (t.slug)}
          <li>
            <a class="card" href={`/trails/${t.slug}/`}>
              <div class="card-main">
                <p class="place">{[...t.countries, ...t.regions].join(" · ")}</p>
                <h3>{t.name}{#if t.draft}<span class="badge">draft</span>{/if}</h3>
                {#if t.localName}<p class="local">{t.localName}</p>{/if}
                <p class="route-ends">{t.start} → {t.end}</p>
                <dl class="figures">
                  {#if t.lengthKm !== null}<div><dt>Length</dt><dd>{fmt(t.lengthKm)}<span>km</span></dd></div>{/if}
                  {#if t.days}<div><dt>Days</dt><dd>{dayText(t.days)}</dd></div>{/if}
                  {#if t.ascentM !== null}<div><dt>Ascent</dt><dd>{fmt(t.ascentM)}<span>m ↑</span></dd></div>{/if}
                  <div><dt>Difficulty</dt>{#if t.sac}<dd>{t.sac}<span>SAC</span></dd>{:else}<dd class="none">Not graded</dd>{/if}</div>
                </dl>
                <ul class="facts">
                  {#if t.water}
                    <li><span class={`mark ${SHAPE[t.water.level]} tone-${TONE[t.water.level]}`} aria-hidden="true"></span>{WATER_WORD[t.water.level]} water</li>
                  {/if}
                  {#if t.wildCamping}
                    <li><span class={`mark ${SHAPE[t.wildCamping]} tone-${TONE[t.wildCamping]}`} aria-hidden="true"></span>{WILD[t.wildCamping]}</li>
                  {/if}
                  {#if sleepText(t)}<li>{sleepText(t)}</li>{/if}
                  {#if t.hub}<li>{fmt(Math.round(t.hub.roadKm))} km by road from {t.hub.name}</li>{/if}
                </ul>
              </div>

              <div class="card-side">
                {#if t.season}
                  <div class="season" aria-label={`Season: ${seasonText(t.season)}`}>
                    {#each MONTHS as m, i}
                      <span class="month" class:in={t.season.includes(i + 1)} class:picked={months.includes(i + 1)} title={m}>{m[0]}</span>
                    {/each}
                  </div>
                {/if}
                {#if t.profile}
                  <figure class="profile">
                    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
                      <path class="area" d={sparkPath(t.profile, true)} />
                      <path class="line" d={sparkPath(t.profile, false)} vector-effect="non-scaling-stroke" />
                    </svg>
                    {#if t.surface}
                      <div class="surface" aria-hidden="true">
                        <span style={`flex: ${t.surface.natural}; background: var(--surface-natural)`}></span>
                        <span style={`flex: ${t.surface.gravel}; background: var(--surface-gravel)`}></span>
                        <span style={`flex: ${t.surface.paved}; background: var(--surface-paved)`}></span>
                      </div>
                    {/if}
                    <figcaption>
                      {fmt(t.lowestM!)}–{fmt(t.highestM!)} m{#if t.surface}{" · "}{Math.round(t.surface.natural * 100)} % natural ground{/if}
                    </figcaption>
                  </figure>
                {/if}
              </div>
            </a>
          </li>
        {/each}
      </ol>
    {:else}
      <div class="empty">
        <p><strong>No trails match all of these filters.</strong></p>
        <p class="muted">Remove one of the filters above, or <button type="button" class="link" onclick={reset}>clear them all</button>.</p>
      </div>
    {/if}
  </div>
</div>

<style>
  .layout {
    display: grid;
    gap: 32px;
    align-items: start;
  }
  @media (min-width: 900px) {
    .layout {
      grid-template-columns: 250px minmax(0, 1fr);
      gap: 40px;
    }
  }

  /* filters: a sidebar on wide screens, a full-screen panel opened by "Filters" on narrow ones */
  .filters {
    display: grid;
    gap: 20px;
  }
  @media (min-width: 900px) {
    .filters {
      position: sticky;
      top: 16px;
      max-height: calc(100vh - 32px);
      overflow-y: auto;
      padding-right: 4px;
    }
  }
  @media (max-width: 899px) {
    .filters {
      position: fixed;
      inset: 0;
      z-index: 50;
      overflow-y: auto;
      padding: 16px 16px 96px;
      background: var(--bg);
      visibility: hidden;
      transform: translateY(8px);
      opacity: 0;
      transition: opacity 0.15s ease, transform 0.15s ease, visibility 0s linear 0.15s;
    }
    .filters.open {
      visibility: visible;
      transform: none;
      opacity: 1;
      transition: opacity 0.15s ease, transform 0.15s ease;
    }
    .close {
      position: fixed;
      right: 16px;
      bottom: 16px;
      left: 16px;
      padding: 14px;
      border: 0;
      border-radius: 999px;
      background: var(--accent);
      color: var(--bg);
      font: 600 1rem var(--sans);
      cursor: pointer;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .filters,
    .filters.open {
      transition: none;
    }
  }
  .filters-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    border-bottom: 1px solid var(--text);
    padding-bottom: 8px;
  }
  .filters-head h2 {
    margin: 0;
    font-size: 1.15rem;
  }
  fieldset {
    margin: 0;
    padding: 0 0 20px;
    border: 0;
    border-bottom: 1px solid var(--line);
  }
  fieldset:last-of-type {
    border-bottom: 0;
  }
  legend {
    margin-bottom: 10px;
    padding: 0;
    font-weight: 600;
    font-size: 0.9rem;
  }
  .hint {
    margin: 8px 0 0;
    color: var(--muted);
    font-size: 0.78rem;
    line-height: 1.4;
  }
  .chips,
  .scale {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .months {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 6px;
  }
  .chip {
    padding: 5px 10px;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--bg);
    color: var(--text);
    font: 500 0.82rem var(--sans);
    cursor: pointer;
  }
  .months .chip,
  .scale .chip {
    padding: 5px 0;
    text-align: center;
  }
  .scale .chip {
    flex: 1;
  }
  .chip:hover {
    border-color: var(--muted);
  }
  .chip[aria-pressed="true"],
  .chip[aria-checked="true"] {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--bg);
  }
  .segmented {
    display: flex;
    margin-top: 10px;
    padding: 2px;
    border: 1px solid var(--line);
    border-radius: 999px;
  }
  .sub {
    margin: 14px 0 0;
    color: var(--muted);
    font-size: 0.8rem;
  }
  .sub.first {
    margin-top: 0;
  }
  .sub + .segmented {
    margin-top: 6px;
  }
  .segmented button {
    flex: 1;
    padding: 5px 6px;
    border: 0;
    border-radius: 999px;
    background: none;
    color: var(--muted);
    font: 500 0.78rem var(--sans);
    cursor: pointer;
  }
  .segmented button[aria-checked="true"] {
    background: var(--surface);
    color: var(--text);
  }
  .check {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-top: 12px;
    font-size: 0.85rem;
    cursor: pointer;
  }
  .check input {
    accent-color: var(--accent);
  }
  select {
    width: 100%;
    padding: 8px 10px;
  }
  .chip:focus-visible,
  .segmented button:focus-visible,
  .link:focus-visible,
  .card:focus-visible,
  .active button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  /* results */
  .search {
    display: flex;
    gap: 8px;
  }
  .search input {
    flex: 1;
    min-width: 0;
    padding: 11px 16px;
    border-radius: 999px;
  }
  .filters-toggle {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 16px;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--bg);
    color: var(--text);
    font: 600 0.9rem var(--sans);
    cursor: pointer;
  }
  @media (min-width: 900px) {
    .close,
    .filters-toggle {
      display: none;
    }
  }
  .count-badge {
    display: inline-grid;
    place-items: center;
    min-width: 20px;
    height: 20px;
    padding: 0 6px;
    border-radius: 999px;
    background: var(--accent);
    color: var(--bg);
    font-size: 0.75rem;
  }
  .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin: 16px 0 0;
  }
  .count {
    margin: 0;
    color: var(--muted);
  }
  .count strong {
    color: var(--text);
  }
  .sort {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--muted);
    font-size: 0.85rem;
  }
  .sort select {
    width: auto;
    padding: 6px 10px;
  }
  .active {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 12px 0 0;
    padding: 0;
    list-style: none;
  }
  .active button {
    display: inline-flex;
    gap: 6px;
    align-items: center;
    padding: 3px 10px;
    border: 0;
    border-radius: 999px;
    background: var(--accent-soft);
    color: var(--text);
    font: 500 0.8rem var(--sans);
    cursor: pointer;
  }
  .active button span {
    color: var(--muted);
    font-size: 1rem;
    line-height: 1;
  }
  .link {
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent);
    font: inherit;
    font-size: 0.85rem;
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .cards {
    display: grid;
    gap: 14px;
    margin: 20px 0 0;
    padding: 0;
    list-style: none;
  }
  .card {
    display: grid;
    gap: 16px 28px;
    padding: 20px;
    border: 1px solid var(--line);
    border-radius: 14px;
    color: var(--text);
    text-decoration: none;
    transition: border-color 0.15s ease;
  }
  .card:hover {
    border-color: var(--accent);
  }
  .card:hover h3 {
    color: var(--accent);
  }
  @media (min-width: 640px) {
    .card {
      grid-template-columns: minmax(0, 1fr) 240px;
    }
  }
  .card p {
    margin: 0;
  }
  .place {
    color: var(--muted);
    font-size: 0.8rem;
  }
  h3 {
    margin: 2px 0 0;
    font-size: 1.35rem;
  }
  .badge {
    margin-left: 8px;
  }
  .local {
    color: var(--muted);
    font-style: italic;
  }
  .route-ends {
    margin-top: 4px !important;
    color: var(--muted);
    font-size: 0.85rem;
  }
  .figures {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 24px;
    margin: 14px 0 0;
  }
  .figures div {
    display: flex;
    flex-direction: column;
  }
  .figures dd {
    order: 1;
    margin: 0;
    font-family: var(--serif);
    font-size: 1.3rem;
    font-weight: 600;
    line-height: 1.2;
  }
  .figures dd span {
    margin-left: 3px;
    color: var(--muted);
    font: 400 0.78rem var(--sans);
  }
  .figures dd.none {
    color: var(--muted);
    font: 400 0.9rem/1.9 var(--sans);
  }
  .figures dt {
    order: 2;
    color: var(--muted);
    font-size: 0.75rem;
  }
  .facts {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 16px;
    margin: 14px 0 0;
    padding: 0;
    list-style: none;
    color: var(--muted);
    font-size: 0.82rem;
  }
  .facts li {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  /* status: a shape plus a word, as on the trail pages; colour only fills the shape */
  .mark {
    flex: none;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 1.5px solid var(--tone);
  }
  .mark.full {
    background: var(--tone);
  }
  .mark.half {
    background: linear-gradient(90deg, var(--tone) 50%, transparent 50%);
  }
  .mark.blocked {
    background: linear-gradient(135deg, transparent 43%, var(--tone) 43% 57%, transparent 57%);
  }
  .tone-good {
    --tone: var(--good);
  }
  .tone-fair {
    --tone: var(--fair);
  }
  .tone-poor {
    --tone: var(--poor);
  }

  .card-side {
    display: grid;
    gap: 14px;
    align-content: start;
  }
  .season {
    display: grid;
    grid-template-columns: repeat(12, 1fr);
    gap: 2px;
  }
  .month {
    padding: 2px 0;
    border-radius: 3px;
    background: var(--surface);
    color: var(--muted);
    font-size: 0.65rem;
    font-weight: 600;
    text-align: center;
  }
  .month.in {
    background: color-mix(in srgb, var(--text) 72%, var(--bg));
    color: var(--bg);
  }
  .month.picked {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
  .profile {
    margin: 0;
  }
  .profile svg {
    display: block;
    width: 100%;
    height: 56px;
  }
  .profile .area {
    fill: var(--accent);
    opacity: 0.14;
  }
  .profile .line {
    fill: none;
    stroke: var(--accent);
    stroke-width: 1.5;
    stroke-linejoin: round;
  }
  .surface {
    display: flex;
    gap: 2px;
    height: 6px;
    margin-top: 4px;
  }
  .surface span {
    border-radius: 2px;
  }
  .profile figcaption {
    margin-top: 6px;
    color: var(--muted);
    font-size: 0.75rem;
  }

  .empty {
    margin-top: 24px;
    padding: 32px 20px;
    border: 1px dashed var(--line);
    border-radius: 14px;
    text-align: center;
  }
  .empty p {
    margin: 0 0 4px;
  }
  @media (prefers-reduced-motion: reduce) {
    .card {
      transition: none;
    }
  }
</style>
