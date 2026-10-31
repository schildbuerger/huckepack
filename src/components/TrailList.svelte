<script lang="ts">
  // The trail search: filters grouped by planning question, in the order a hiker decides (when,
  // where, how long, how hard, what it looks like, the ground, sleeping, wild camping, water)
  // beside a list of result cards. Everything runs in the browser
  // on the summaries built at build time; the filters live in the URL, so a search can be shared.
  import { onMount } from "svelte";
  import { SLEEPING_CATEGORIES, WATER_LEVELS } from "../lib/trails";
  import type { SearchTrail } from "../lib/search";
  import {
    LANDSCAPES,
    LEVEL_WORDS,
    MONTHS,
    SAC,
    activeFilters,
    climateLevel,
    fromParams,
    matches,
    noFilters,
    toParams,
    type Filters,
  } from "../lib/filters";
  import FilterPanel from "./FilterPanel.svelte";

  let { trails, eleRange }: { trails: SearchTrail[]; eleRange: [number, number] } = $props();

  // the hardest of a trail's three ratings over its season (for sorting)
  const hardest = (t: SearchTrail) => {
    const xs = [t.terrainLevel, t.effortLevel, climateLevel(t, [])].filter((x) => x !== null) as number[];
    return xs.length ? Math.max(...xs) : null;
  };
  const SORTS = {
    name: { label: "Name", value: (t: SearchTrail) => t.name },
    shortest: { label: "Shortest first", value: (t: SearchTrail) => t.compareKm },
    longest: { label: "Longest first", value: (t: SearchTrail) => (t.compareKm === null ? null : -t.compareKm) },
    days: { label: "Fewest days", value: (t: SearchTrail) => t.days?.[0] ?? null },
    easiest: {
      label: "Easiest first",
      value: (t: SearchTrail) => (hardest(t) === null ? null : hardest(t)! * 10 + (t.sac === null ? 9 : SAC.indexOf(t.sac))),
    },
    flattest: {
      label: "Least climbing per km",
      value: (t: SearchTrail) => (t.climb === null || !t.compareKm ? null : t.climb.m / t.compareKm),
    },
    natural: { label: "Most natural ground", value: (t: SearchTrail) => (t.surface ? -t.surface.natural : null) },
  } as const;
  type SortKey = keyof typeof SORTS;

  // filter state (src/lib/filters.ts; sliders hold stop indexes), each filter a URL parameter;
  // the controls are FilterPanel.svelte, shared with the trail map
  let filters = $state<Filters>(noFilters());
  let sort = $state<SortKey>("name");
  let filtersOpen = $state(false);
  let ready = false;

  const sleepingOptions = SLEEPING_CATEGORIES.filter((c) => c.id !== "wild-camping");

  onMount(() => {
    const p = new URLSearchParams(location.search);
    filters = fromParams(
      p,
      sleepingOptions.map((c) => c.id),
    );
    sort = (p.get("sort") ?? "") in SORTS ? (p.get("sort") as SortKey) : "name";
    ready = true;
  });

  // keep the URL in step with the filters (replace, not push: the back button leaves the page)
  $effect(() => {
    const p = toParams(filters);
    if (sort !== "name") p.set("sort", sort);
    if (!ready) return;
    const search = p.toString();
    history.replaceState(null, "", search ? `?${search}` : location.pathname);
  });

  let shown = $derived(
    trails.filter((t) => matches(t, filters)).sort((a, b) => {
      const [x, y] = [SORTS[sort].value(a), SORTS[sort].value(b)];
      if (x === y) return a.name.localeCompare(b.name);
      if (x === null) return 1; // unknown values last
      if (y === null) return -1;
      return typeof x === "string" ? x.localeCompare(y as string) : x - (y as number);
    }),
  );

  // the active filters as removable chips
  let active = $derived(
    activeFilters(filters, sleepingOptions).map((a) => ({ label: a.label, clear: () => Object.assign(filters, a.reset) })),
  );

  function reset() {
    filters = noFilters();
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
  const sleepText = (t: SearchTrail) =>
    SLEEPING_CATEGORIES.filter((c) => c.id !== "wild-camping" && t.sleeping.includes(c.id))
      .map((c) => c.label)
      .join(" · ");
  const WILD = { allowed: "Wild camping allowed", restricted: "Wild camping restricted", prohibited: "No wild camping" };
  const WATER_WORD = Object.fromEntries(WATER_LEVELS.map((l) => [l.id, l.label]));
  // the card's difficulty (issue #22): the hardest dimension as a word, as on the trail page
  const topLevel = (t: SearchTrail) => (t.difficulty.length ? Math.max(...t.difficulty.map((d) => d.level)) : null);
  const levelSay = (d: SearchTrail["difficulty"][number]) =>
    d.low ? `${LEVEL_WORDS[d.low - 1]} to ${LEVEL_WORDS[d.level - 1]}` : LEVEL_WORDS[d.level - 1];
  // the main landscape, as the trail page's key figure says it
  const landText = (t: SearchTrail) => {
    const top = Object.entries(t.landscape ?? {}).sort((a, b) => b[1] - a[1])[0];
    const label = top && LANDSCAPES.find((l) => l.id === top[0])?.label;
    return label ? `${top[1] >= 0.5 ? "Mostly" : "Mainly"} ${label}` : null;
  };
  const SHAPE = { frequent: "full", regular: "half", scarce: "blocked", allowed: "full", restricted: "half", prohibited: "blocked" } as const;
  const TONE = { frequent: "good", regular: "fair", scarce: "poor", allowed: "good", restricted: "fair", prohibited: "poor" } as const;
</script>

<div class="layout">
  <aside class="filters" class:open={filtersOpen} aria-label="Filters">
    <div class="filters-head">
      <h2>Filters</h2>
      <!-- always in the layout, only hidden, so showing it doesn't shift the filters below -->
      <button type="button" class="link" class:hidden={!active.length} onclick={reset}>Clear all</button>
      <button type="button" class="close" onclick={() => (filtersOpen = false)}>Show {shown.length} {shown.length === 1 ? "trail" : "trails"}</button>
    </div>

    <FilterPanel {trails} bind:filters />
  </aside>

  <div class="results">
    <div class="bar">
      <p class="count" role="status">
        {#if active.length}<strong>{shown.length}</strong> of {trails.length} {trails.length === 1 ? "trail" : "trails"}
        {:else}<strong>{trails.length}</strong> {trails.length === 1 ? "trail" : "trails"}{/if}
        <!-- the trail map (issue #33), a quiet way to the same trails by place, with the same filters -->
        <a class="map-link" href={`/trails/map/${toParams(filters).toString() ? `?${toParams(filters)}` : ""}`}>Map view <span aria-hidden="true">→</span></a>
      </p>
      <label class="sort">
        <span class="sort-word">Sort</span>
        <select bind:value={sort}>
          {#each Object.entries(SORTS) as [key, s]}<option value={key}>{s.label}</option>{/each}
        </select>
      </label>
      <button type="button" class="filters-toggle" onclick={() => (filtersOpen = true)}>
        Filters{#if active.length}<span class="count-badge">{active.length}</span>{/if}
      </button>
    </div>

    {#if active.length}
      <ul class="active">
        {#each active as f}
          <li><button type="button" onclick={f.clear} aria-label={`Remove filter: ${f.label}`}>{f.label}<span aria-hidden="true">×</span></button></li>
        {/each}
      </ul>
    {/if}

    {#if shown.length}
      <!-- the cards' names are h3s; on phones the filters' h2 is in the closed panel, so the results
           carry their own h2 for screen readers (headings in order, Lighthouse) -->
      <h2 class="sr-only">Matching trails</h2>
      <ol class="cards">
        {#each shown as t (t.slug)}
          <li>
            <a class="card" href={`/trails/${t.slug}/`}>
              <div class="card-main">
                <p class="place">{t.countries.join(" · ")}</p>
                <h3>{t.name}</h3>
                {#if t.localName}<p class="local">{t.localName}</p>{/if}
                <p class="route-ends">{t.start} → {t.end}</p>
                <dl class="figures">
                  {#if t.lengthKm !== null}<div><dt>Length</dt><dd>{fmt(t.lengthKm)}<span>km</span></dd></div>{/if}
                  {#if t.days}<div><dt>Days</dt><dd>{dayText(t.days)}</dd></div>{/if}
                  {#if t.climb}
                    <div>
                      <dt>{t.climb.est ? "Ascent, estimated" : "Ascent"}</dt>
                      <dd>{#if t.climb.est}<span class="approx" aria-hidden="true">≈</span>{/if}{fmt(t.climb.m)}<span>m ↑</span></dd>
                    </div>
                  {/if}
                  {#if topLevel(t)}
                    <div>
                      <dt>Difficulty</dt>
                      <dd class="diff">
                        <span class="sr-only">{t.difficulty.map((d) => `${d.label}: ${levelSay(d)}`).join("; ")}. Overall: </span>
                        <!-- as the trail page's key figure: one bar per dimension (its initial beneath), as tall
                             as its level; climate's season range lighter on top -->
                        <span class="diff-bars" aria-hidden="true">
                          {#each t.difficulty as d}
                            <span class="diff-col" title={`${d.label}: ${levelSay(d)}`}>
                              <span class="diff-bar range" style={`height: ${d.level * 25}%`}></span>
                              <span class="diff-bar" style={`height: ${(d.low ?? d.level) * 25}%`}></span>
                              <span class="diff-tag">{d.label[0]}</span>
                            </span>
                          {/each}
                        </span>
                        {LEVEL_WORDS[topLevel(t)! - 1]}
                      </dd>
                    </div>
                  {/if}
                </dl>
                <ul class="facts">
                  {#if landText(t)}<li>{landText(t)}</li>{/if}
                  {#if t.water}
                    <li><span class={`mark ${SHAPE[t.water.level]} tone-${TONE[t.water.level]}`} aria-hidden="true"></span>{WATER_WORD[t.water.level]} water</li>
                  {/if}
                  {#if t.wildCamping}
                    <li><span class={`mark ${SHAPE[t.wildCamping]} tone-${TONE[t.wildCamping]}`} aria-hidden="true"></span>{WILD[t.wildCamping]}</li>
                  {/if}
                  {#if sleepText(t)}<li>{sleepText(t)}</li>{/if}
                </ul>
              </div>

              <div class="card-side">
                {#if t.season}
                  <div class="season" aria-label={`Season: ${seasonText(t.season)}`}>
                    {#each MONTHS as m, i}
                      <span class="month" class:in={t.season.includes(i + 1)} title={m}>{m[0]}</span>
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
  /* minmax(0, …): the column never grows past the screen to fit the bar above the results */
  .layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
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
  /* wide screens: the sidebar scrolls with the page, no inner scroll box (its scrollbar came and
     went with the content, which shifted everything sideways) */
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
      z-index: 2; /* above the sliders' thumbs */
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
  /* touch screens: a taller filter button */
  @media (pointer: coarse) {
    .filters-toggle {
      min-height: 40px;
    }
  }
  select {
    width: 100%;
    padding: 8px 10px;
  }
  /* focus drawn inside the box: the global outline would stick out past the filter column */
  .filters select:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: inset 0 0 0 1px var(--accent);
  }
  .link.hidden {
    visibility: hidden;
  }
  .link:focus-visible,
  .card:focus-visible,
  .active button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  /* results */
  .filters-toggle {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
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
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin: 0;
  }
  .count {
    margin: 0 auto 0 0;
    white-space: nowrap;
    color: var(--muted);
  }
  .count strong {
    color: var(--text);
  }
  .map-link {
    margin-left: 12px;
    font-size: 0.9rem;
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
  .local {
    color: var(--muted);
    font-style: italic;
  }
  .route-ends {
    margin-top: 4px !important;
    color: var(--muted);
    font-size: 0.85rem;
  }
  /* aligned at the bottom: the difficulty bars stand taller than the numbers, the labels stay in line */
  .figures {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 8px 24px;
    margin: 14px 0 0;
  }
  /* phones: length, days and ascent in one even row, the difficulty on its own beneath; the sort
     label left to screen readers */
  @media (max-width: 479px) {
    .figures div:has(.diff) {
      grid-column: 1 / -1;
    }
    .figures {
      display: grid;
      grid-template-columns: repeat(3, auto);
      justify-content: space-between;
      gap: 8px 12px;
    }
    .figures dd {
      font-size: 1.15rem;
    }
    .card {
      padding: 16px;
    }
    .sort-word {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
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
  .figures dd .approx {
    margin: 0 3px 0 0;
  }
  /* difficulty: the trail page's key figure (src/pages/trails/[slug].astro .diff-fig), same sizes:
     one bar per dimension, as tall as its level, its initial beneath; the
     hardest level as a word beside them */
  .figures dd.diff {
    display: flex;
    align-items: flex-end;
    gap: 8px;
  }
  .diff-bars {
    display: flex;
    gap: 3px;
    height: 2rem;
    margin: 0 !important;
    padding-bottom: 0.15rem;
  }
  .diff-col {
    position: relative;
    width: 9px;
    height: calc(100% - 11px);
    margin: 0 !important;
    background: var(--line);
    border-radius: 2px 2px 0 0;
  }
  .diff-bar {
    position: absolute;
    inset: auto 0 0;
    margin: 0 !important;
    background: var(--text);
    border-radius: 2px 2px 0 0;
  }
  .diff-bar.range {
    opacity: 0.4;
  }
  .diff-tag {
    position: absolute;
    inset: auto 0 -12px;
    margin: 0 !important;
    color: var(--muted);
    font: 400 0.6rem/1 var(--sans) !important;
    text-align: center;
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

  /* the season on top, the profile filling the rest of the card's height, its caption at the bottom */
  .card-side {
    display: flex;
    flex-direction: column;
    gap: 14px;
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
  .profile {
    display: flex;
    flex: 1;
    flex-direction: column;
    margin: 0;
  }
  .profile svg {
    display: block;
    width: 100%;
    height: 56px;
  }
  /* beside the card's text: the profile fills the height the text leaves */
  @media (min-width: 640px) {
    .profile svg {
      flex: 1;
      height: auto;
      min-height: 56px;
    }
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
