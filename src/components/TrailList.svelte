<script lang="ts">
  // The trail search: filters grouped by planning question (when, how long, how hard, where,
  // sleeping, water, terrain) beside a list of result cards. Everything runs in the browser
  // on the summaries built at build time; the filters live in the URL, so a search can be shared.
  import { onMount } from "svelte";
  import { SAC_NOTE, SAC_SCALE, SLEEPING_CATEGORIES, WATER_LEVELS, type TrailSummary } from "../lib/trails";
  import {
    DAYS,
    DAYS_ALL,
    MONTHS,
    NATURAL_PCT,
    SAC,
    WATER_KM,
    fromParams,
    matches,
    places as placesOf,
    toParams,
    type Filters,
  } from "../lib/filters";
  import Explain from "./Explain.svelte";
  import Range from "./Range.svelte";

  let { trails, eleRange }: { trails: TrailSummary[]; eleRange: [number, number] } = $props();

  // slider labels for the shared stops (src/lib/filters.ts)
  const DAY_STOPS = DAYS.map((d, i) => (i === DAYS.length - 1 ? `${d}+` : `${d}`));
  const SAC_STOPS = [...SAC, "Any"];
  const WATER_STOPS = [...WATER_KM.map((km) => `${km} km`), "Any"];
  const NATURAL_STOPS = NATURAL_PCT.map((n) => (n ? `${n} %` : "Any"));
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

  // filter state; sliders hold stop indexes. Each filter maps to a URL parameter.
  let months = $state<number[]>([]);
  let dayLo = $state(0);
  let dayHi = $state(DAYS_ALL);
  let sacMax = $state(SAC.length); // "Any"
  let where = $state("");
  let sleep = $state<string[]>([]);
  let wild = $state<Filters["wild"]>("");
  let waterMax = $state(WATER_KM.length); // "Any"
  let naturalMin = $state(0); // "Any"
  let sort = $state<SortKey>("name");
  let filtersOpen = $state(false);
  let ready = false;

  let daysOn = $derived(dayLo > 0 || dayHi < DAYS_ALL);
  let sacOn = $derived(sacMax < SAC.length);
  let waterOn = $derived(waterMax < WATER_KM.length);
  let naturalOn = $derived(naturalMin > 0);

  const places = placesOf(trails);
  const sleepingOptions = SLEEPING_CATEGORIES.filter((c) => c.id !== "wild-camping");

  onMount(() => {
    const p = new URLSearchParams(location.search);
    ({ months, dayLo, dayHi, sacMax, where, sleep, wild, waterMax, naturalMin } = fromParams(
      p,
      sleepingOptions.map((c) => c.id),
    ));
    sort = (p.get("sort") ?? "") in SORTS ? (p.get("sort") as SortKey) : "name";
    ready = true;
  });

  let current: Filters = $derived({ months, dayLo, dayHi, sacMax, where, sleep, wild, waterMax, naturalMin });

  // keep the URL in step with the filters (replace, not push: the back button leaves the page)
  $effect(() => {
    const p = toParams(current);
    if (sort !== "name") p.set("sort", sort);
    if (!ready) return;
    const search = p.toString();
    history.replaceState(null, "", search ? `?${search}` : location.pathname);
  });

  const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);

  let shown = $derived(
    trails.filter((t) => matches(t, current)).sort((a, b) => {
      const [x, y] = [SORTS[sort].value(a), SORTS[sort].value(b)];
      if (x === y) return a.name.localeCompare(b.name);
      if (x === null) return 1; // unknown values last
      if (y === null) return -1;
      return typeof x === "string" ? x.localeCompare(y as string) : x - (y as number);
    }),
  );

  // what each slider is set to, in words (beside the group title and on the chips)
  let daysText = $derived(
    !daysOn ? "Any length" : dayLo === dayHi ? `${DAY_STOPS[dayLo]} days` : `${DAYS[dayLo]}–${DAY_STOPS[dayHi]} days`,
  );
  let sacText = $derived(sacOn ? `Up to ${SAC[sacMax]}` : "Any grade");
  let waterText = $derived(waterOn ? `Every ${WATER_KM[waterMax]} km or less` : "Any");
  let naturalText = $derived(naturalOn ? `${NATURAL_PCT[naturalMin]} %+ natural` : "Any");

  // the active filters as removable chips
  const monthList = (ms: number[]) => [...ms].sort((a, b) => a - b).map((m) => MONTHS[m - 1]).join(", ");
  let active = $derived(
    [
      months.length && { label: monthList(months), clear: () => (months = []) },
      daysOn && { label: daysText, clear: () => ((dayLo = 0), (dayHi = DAYS_ALL)) },
      sacOn && { label: `Up to SAC ${SAC[sacMax]}`, clear: () => (sacMax = SAC.length) },
      where && { label: where, clear: () => (where = "") },
      ...sleep.map((id) => ({ label: SLEEPING_CATEGORIES.find((c) => c.id === id)!.label, clear: () => (sleep = toggle(sleep, id)) })),
      wild && { label: wild === "allowed" ? "Wild camping allowed" : "Wild camping possible", clear: () => (wild = "") },
      waterOn && { label: `Water every ${WATER_KM[waterMax]} km or less`, clear: () => (waterMax = WATER_KM.length) },
      naturalOn && { label: `At least ${NATURAL_PCT[naturalMin]} % natural ground`, clear: () => (naturalMin = 0) },
    ].filter(Boolean) as { label: string; clear: () => void }[],
  );

  function reset() {
    where = wild = "";
    months = [];
    sleep = [];
    dayLo = naturalMin = 0;
    dayHi = DAYS_ALL;
    sacMax = SAC.length;
    waterMax = WATER_KM.length;
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
      <!-- always in the layout, only hidden, so showing it doesn't shift the filters below -->
      <button type="button" class="link" class:hidden={!active.length} onclick={reset}>Clear all</button>
      <button type="button" class="close" onclick={() => (filtersOpen = false)}>Show {shown.length} {shown.length === 1 ? "trail" : "trails"}</button>
    </div>

    <!-- groups, not fieldsets: a legend can't hold the explanation popover -->
    <div class="group" role="group" aria-labelledby="g-when">
      <div class="legend" id="g-when">
        <Explain id="x-when" term="When do you want to go?" title="Season">
          <p>A trail matches if its season includes any of the months you pick. The season is what the trail's managers recommend; outside it, huts and services may be closed or snow may block the way.</p>
        </Explain>
      </div>
      <div class="months">
        {#each MONTHS as m, i}
          <button type="button" class="chip" aria-pressed={months.includes(i + 1)} onclick={() => (months = toggle(months, i + 1))}>{m}</button>
        {/each}
      </div>
    </div>

    <div class="group" role="group" aria-labelledby="g-long">
      <div class="legend" id="g-long">
        <Explain id="x-long" term="How long?" title="Walking days">
          <p>The number of days the trail's managers suggest for the whole route. Where they give a range, such as 6–8 days, the trail matches if that range overlaps yours.</p>
        </Explain>
        <span class="value">{daysText}</span>
      </div>
      <Range stops={DAY_STOPS} bind:lo={dayLo} bind:hi={dayHi} label="Walking days" ticks={[0, 6, 9, 12, DAYS_ALL]} />
    </div>

    <div class="group" role="group" aria-labelledby="g-hard">
      <div class="legend" id="g-hard">
        <Explain id="x-hard" term="How hard, at most?" title="SAC hiking scale">
          <p>{SAC_NOTE}</p>
          <p>Slide to the hardest grade you're happy with; trails up to that grade stay. Once you pick a grade, trails without one are left out.</p>
          <dl>
            {#each SAC as s}<dt>{s} · {SAC_SCALE[s].name}</dt><dd>{SAC_SCALE[s].text}</dd>{/each}
          </dl>
        </Explain>
        <span class="value">{sacText}</span>
      </div>
      <Range stops={SAC_STOPS} bind:hi={sacMax} off={SAC.length} label="Highest SAC grade" />
    </div>

    <div class="group" role="group" aria-labelledby="g-where">
      <div class="legend" id="g-where">Where?</div>
      <select bind:value={where} aria-label="Continent or country">
        <option value="">Anywhere</option>
        {#each places as p}
          <optgroup label={p.continent}>
            <option value={p.continent}>All of {p.continent}</option>
            {#each p.countries as c}<option value={c}>{c}</option>{/each}
          </optgroup>
        {/each}
      </select>
    </div>

    <div class="group" role="group" aria-labelledby="g-sleep">
      <div class="legend" id="g-sleep">
        <Explain id="x-sleep" term="Where to sleep">
          <p>A trail matches if it offers every kind you pick.</p>
          <dl>
            {#each sleepingOptions as c}<dt>{c.label}</dt><dd>{c.hint}</dd>{/each}
          </dl>
        </Explain>
      </div>
      <div class="chips">
        {#each sleepingOptions as c}
          <button type="button" class="chip" aria-pressed={sleep.includes(c.id)} onclick={() => (sleep = toggle(sleep, c.id))}>{c.label}</button>
        {/each}
      </div>
    </div>

    <div class="group" role="group" aria-labelledby="g-wild">
      <div class="legend" id="g-wild">
        <Explain id="x-wild" term="Wild camping">
          <dl>
            <dt>Possible</dt><dd>Allowed, or allowed only in certain places or under rules, such as designated bivouac sites.</dd>
            <dt>Allowed</dt><dd>Pitching a tent outside campsites is allowed along the trail.</dd>
          </dl>
          <p>Each trail page gives the exact rule.</p>
        </Explain>
      </div>
      <div class="segmented" role="radiogroup" aria-labelledby="g-wild">
        <button type="button" role="radio" aria-checked={wild === ""} onclick={() => (wild = "")}>Any</button>
        <button type="button" role="radio" aria-checked={wild === "some"} onclick={() => (wild = "some")}>Possible</button>
        <button type="button" role="radio" aria-checked={wild === "allowed"} onclick={() => (wild = "allowed")}>Allowed</button>
      </div>
    </div>

    <div class="group" role="group" aria-labelledby="g-water">
      <div class="legend" id="g-water">
        <Explain id="x-water" term="Drinking water" title="Drinking water">
          <p>The longest stretch of the main route without drinking water (taps, fountains and drinking springs mapped in OpenStreetMap) must be at most this long.</p>
          <p>Trail pages rate it in three steps:</p>
          <dl>
            {#each WATER_LEVELS as l}<dt>{l.label}</dt><dd>{l.hint}.</dd>{/each}
          </dl>
        </Explain>
        <span class="value">{waterText}</span>
      </div>
      <Range stops={WATER_STOPS} bind:hi={waterMax} off={WATER_KM.length} label="Longest stretch without drinking water, at most" ticks={[0, 3, WATER_KM.length]} />
    </div>

    <div class="group" role="group" aria-labelledby="g-terrain">
      <div class="legend" id="g-terrain">
        <Explain id="x-terrain" term="Natural ground" title="Ground underfoot">
          <p>The share of the main route on natural ground at least, from OpenStreetMap's surface tags. The bar under each card's profile shows the mix:</p>
          <!-- the same colours as the surface bar on each card -->
          <ul class="ground">
            <li><span style="background: var(--surface-natural)"></span>Natural: earth, grass, rock</li>
            <li><span style="background: var(--surface-gravel)"></span>Gravel</li>
            <li><span style="background: var(--surface-paved)"></span>Paved</li>
          </ul>
        </Explain>
        <span class="value">{naturalText}</span>
      </div>
      <Range stops={NATURAL_STOPS} bind:hi={naturalMin} off={0} fill="above" label="Share of natural ground, at least" ticks={[0, 5, 9]} />
    </div>
  </aside>

  <div class="results">
    <div class="bar">
      <p class="count" role="status">
        {#if active.length}<strong>{shown.length}</strong> of {trails.length} {trails.length === 1 ? "trail" : "trails"}
        {:else}<strong>{trails.length}</strong> {trails.length === 1 ? "trail" : "trails"}{/if}
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
  .group {
    padding: 0 0 20px;
    border-bottom: 1px solid var(--line);
  }
  .group:last-child {
    border-bottom: 0;
  }
  .legend .value {
    color: var(--muted);
    font-weight: 400;
    font-size: 0.8rem;
  }
  .legend {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
    margin-bottom: 10px;
    font-weight: 600;
    font-size: 0.9rem;
  }
  .chips {
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
  .months .chip {
    padding: 5px 0;
    text-align: center;
  }
  .chip:hover {
    border-color: var(--muted);
  }
  /* touch screens: taller targets for fingers */
  @media (pointer: coarse) {
    .chip,
    .months .chip {
      padding-top: 9px;
      padding-bottom: 9px;
    }
    .segmented button {
      padding-top: 9px;
      padding-bottom: 9px;
    }
    .filters-toggle {
      min-height: 40px;
    }
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
  .legend + .segmented {
    margin-top: 0;
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
  .ground {
    display: grid;
    gap: 4px;
    margin: 0 0 8px;
    padding: 0;
    list-style: none;
  }
  .ground li {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .ground span {
    width: 18px;
    height: 6px;
    border-radius: 2px;
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
  .chip:focus-visible,
  .segmented button:focus-visible,
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
  .figures {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 24px;
    margin: 14px 0 0;
  }
  /* phones: the four figures in one even row, the sort label left to screen readers */
  @media (max-width: 479px) {
    .figures {
      display: grid;
      grid-template-columns: repeat(4, auto);
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
