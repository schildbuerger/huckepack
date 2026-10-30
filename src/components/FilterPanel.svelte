<script lang="ts">
  // The trail filters' controls, grouped by planning question in the order a hiker decides, shared
  // by the search page (TrailList.svelte) and the trail map (TrailsMap.svelte): `filters` is the
  // state (src/lib/filters.ts), bound by the page; `groups` shows only some of them (the map's
  // filter buttons show one or two each), `idPrefix` keeps ids apart where a page shows them twice.
  // Options that would leave no trail with the other filters are disabled (one that is on never
  // is, so it can be undone); sliders mark those stops and won't move onto them.
  import type { SearchTrail } from "../lib/search";
  import { SLEEPING_CATEGORIES, WATER_LEVELS } from "../lib/trails";
  import {
    DAYS,
    DAYS_ALL,
    DAY_STOPS,
    LANDSCAPES,
    LANDSCAPE_SHARE,
    LEVEL_TOP,
    LEVEL_WORDS,
    MONTHS,
    NATURAL_STOPS,
    WATER_KM,
    WATER_STOPS,
    daysText,
    levelText,
    matches,
    naturalText,
    places as placesOf,
    toggleWhere,
    waterText,
    type Filters,
  } from "../lib/filters";
  import Explain from "./Explain.svelte";
  import Range from "./Range.svelte";

  export type Group = "when" | "where" | "days" | "hard" | "land" | "ground" | "sleep" | "wild" | "water";

  let {
    trails,
    filters = $bindable(),
    groups,
    idPrefix = "",
  }: { trails: SearchTrail[]; filters: Filters; groups?: Group[]; idPrefix?: string } = $props();

  const show = (g: Group) => !groups || groups.includes(g);
  const LEVEL_STOPS = LEVEL_WORDS;
  const places = placesOf(trails);
  const sleepingOptions = SLEEPING_CATEGORIES.filter((c) => c.id !== "wild-camping");
  const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);

  const NONE = "No trail matches this with your other filters";
  const countWith = (set: Partial<Filters>) => trails.filter((t) => matches(t, { ...filters, ...set })).length;
  const dead = (on: boolean, set: Partial<Filters>) => !on && countWith(set) === 0;
  const liveStops = (n: number, set: (i: number) => Partial<Filters>) => Array.from({ length: n }, (_, i) => countWith(set(i)) > 0);
  // a day thumb can't pass the other one, so stops beyond it count as live (nothing to mark there)
  let dayLoLive = $derived(liveStops(DAYS.length, (i) => ({ dayLo: i })).map((ok, i) => ok || i > filters.dayHi));
  let dayHiLive = $derived(liveStops(DAYS.length, (i) => ({ dayHi: i })).map((ok, i) => ok || i < filters.dayLo));
  let waterLive = $derived(liveStops(WATER_STOPS.length, (i) => ({ waterMax: i })));
  let naturalLive = $derived(liveStops(NATURAL_STOPS.length, (i) => ({ naturalMin: i })));
  // difficulty thumbs, as the day thumbs: stops beyond the other thumb count as live
  const levelLive = (key: "terrain" | "climate" | "effort", min: number, max: number) => ({
    lo: liveStops(LEVEL_STOPS.length, (i) => ({ [`${key}Min`]: i })).map((ok, i) => ok || i > max),
    hi: liveStops(LEVEL_STOPS.length, (i) => ({ [`${key}Max`]: i })).map((ok, i) => ok || i < min),
  });
  let terrainLive = $derived(levelLive("terrain", filters.terrainMin, filters.terrainMax));
  let climateLive = $derived(levelLive("climate", filters.climateMin, filters.climateMax));
  let effortLive = $derived(levelLive("effort", filters.effortMin, filters.effortMax));
</script>

<div class="panel">
    <!-- groups, not fieldsets: a legend can't hold the explanation popover -->
    {#if show("when")}
    <div class="group" role="group" aria-labelledby={`${idPrefix}g-when`}>
      <div class="legend" id={`${idPrefix}g-when`}>
        <Explain id={`${idPrefix}x-when`} term="When do you want to go?" title="Season">
          <p>A trail matches if its season includes any of the months you pick. The season is what the trail's managers recommend; outside it, huts and services may be closed or snow may block the way.</p>
        </Explain>
      </div>
      <div class="months">
        {#each MONTHS as m, i}
          {@const off = dead(filters.months.includes(i + 1), { months: toggle(filters.months, i + 1) })}
          <button type="button" class="chip" aria-pressed={filters.months.includes(i + 1)} disabled={off} title={off ? NONE : undefined} onclick={() => (filters.months = toggle(filters.months, i + 1))}>{m}</button>
        {/each}
      </div>
    </div>
    {/if}

    {#if show("where")}
    <div class="group" role="group" aria-labelledby={`${idPrefix}g-where`}>
      <div class="legend" id={`${idPrefix}g-where`}>
        <Explain id={`${idPrefix}x-where`} term="Where?" title="Continents and countries">
          <p>Pick as many as you like; a trail matches if it runs through any of them.</p>
          <p>A continent includes all its countries. Picking a country within a chosen continent narrows the choice to that country.</p>
        </Explain>
      </div>
      <!-- a continent, its countries beneath; countries a chosen continent covers show as included -->
      {#each places as p}
        {@const off = dead(filters.where.includes(p.continent), { where: toggleWhere(filters.where, p.continent, places) })}
        <div class="place">
          <button type="button" class="chip" aria-pressed={filters.where.includes(p.continent)} disabled={off} title={off ? NONE : undefined} onclick={() => (filters.where = toggleWhere(filters.where, p.continent, places))}>
            {p.continent}
          </button>
          <div class="chips countries">
            {#each p.countries as c}
              {@const off = dead(filters.where.includes(c), { where: toggleWhere(filters.where, c, places) })}
              <button
                type="button"
                class="chip"
                class:included={filters.where.includes(p.continent)}
                aria-pressed={filters.where.includes(c)}
                disabled={off}
                title={off ? NONE : undefined}
                onclick={() => (filters.where = toggleWhere(filters.where, c, places))}
              >
                {c}
              </button>
            {/each}
          </div>
        </div>
      {/each}
    </div>
    {/if}

    {#if show("days")}
    <div class="group" role="group" aria-labelledby={`${idPrefix}g-long`}>
      <div class="legend" id={`${idPrefix}g-long`}>
        <Explain id={`${idPrefix}x-long`} term="How long?" title="Walking days">
          <p>The number of days the trail's managers suggest for the whole route. Where they give a range, such as 6–8 days, the trail matches if that range overlaps yours.</p>
        </Explain>
        <span class="value">{daysText(filters)}</span>
      </div>
      <Range stops={DAY_STOPS} bind:lo={filters.dayLo} bind:hi={filters.dayHi} live={dayHiLive} liveLo={dayLoLive} label="Walking days" ticks={[0, 6, 9, 12, DAYS_ALL]} />
    </div>
    {/if}

    {#if show("hard")}
    <div class="group" role="group" aria-labelledby={`${idPrefix}g-hard`}>
      <div class="legend" id={`${idPrefix}g-hard`}>
        <Explain id={`${idPrefix}x-hard`} term="How hard?" title="Difficulty">
          <p>The ratings on each trail page's Difficulty section, from Easy to Hard with the same thresholds for every trail. Slide either end: the left thumb for the least, the right for the most you want. Once you set one, trails without that rating drop out.</p>
          <dl>
            <dt>Terrain</dt><dd>The path grade (SAC scale), how much and how steeply it climbs, and how much is natural ground.</dd>
            <dt>Climate</dt><dd>Heat, cold, wet days, snow and wind: in the months you picked above (within the trail's season), or over its whole season.</dd>
            <dt>Effort</dt><dd>The longest day: up to 4 h is easy, 4–6 h moderate, 6–8 h demanding, more is hard.</dd>
          </dl>
        </Explain>
      </div>
      <div class="sub">
        <span>Terrain</span><span class="value">{levelText(filters.terrainMin, filters.terrainMax)}</span>
      </div>
      <Range stops={LEVEL_STOPS} bind:lo={filters.terrainMin} bind:hi={filters.terrainMax} live={terrainLive.hi} liveLo={terrainLive.lo} label="Terrain" ticks={[0, LEVEL_TOP]} />
      <div class="sub">
        <span>Climate{filters.months.length ? " in your months" : ""}</span><span class="value">{levelText(filters.climateMin, filters.climateMax)}</span>
      </div>
      <Range stops={LEVEL_STOPS} bind:lo={filters.climateMin} bind:hi={filters.climateMax} live={climateLive.hi} liveLo={climateLive.lo} label="Climate" ticks={[0, LEVEL_TOP]} />
      <div class="sub">
        <span>Effort, longest day</span><span class="value">{levelText(filters.effortMin, filters.effortMax)}</span>
      </div>
      <Range stops={LEVEL_STOPS} bind:lo={filters.effortMin} bind:hi={filters.effortMax} live={effortLive.hi} liveLo={effortLive.lo} label="Effort, longest day" ticks={[0, LEVEL_TOP]} />
    </div>
    {/if}
    {#if show("land")}
    <div class="group" role="group" aria-labelledby={`${idPrefix}g-land`}>
      <div class="legend" id={`${idPrefix}g-land`}>
        <Explain id={`${idPrefix}x-land`} term="Landscape" title="Landscape">
          <p>What the trail passes through, from ESA WorldCover satellite land cover: a trail matches if at least {Math.round(LANDSCAPE_SHARE * 100)} % of its main route is a landscape you pick (any of them).</p>
        </Explain>
      </div>
      <div class="chips">
        {#each LANDSCAPES as l}
          {@const off = dead(filters.land.includes(l.id), { land: toggle(filters.land, l.id) })}
          <button type="button" class="chip" aria-pressed={filters.land.includes(l.id)} disabled={off} title={off ? NONE : undefined} onclick={() => (filters.land = toggle(filters.land, l.id))}>{l.label}</button>
        {/each}
      </div>
    </div>
    {/if}
    {#if show("ground")}
    <div class="group" role="group" aria-labelledby={`${idPrefix}g-terrain`}>
      <div class="legend" id={`${idPrefix}g-terrain`}>
        <Explain id={`${idPrefix}x-terrain`} term="Natural ground" title="Ground underfoot">
          <p>The share of the main route on natural ground at least, from OpenStreetMap's surface tags. The bar under each card's profile shows the mix:</p>
          <!-- the same colours as the surface bar on each card -->
          <ul class="ground">
            <li><span style="background: var(--surface-natural)"></span>Natural: earth, grass, rock</li>
            <li><span style="background: var(--surface-gravel)"></span>Gravel</li>
            <li><span style="background: var(--surface-paved)"></span>Paved</li>
          </ul>
        </Explain>
        <span class="value">{naturalText(filters)}</span>
      </div>
      <Range stops={NATURAL_STOPS} bind:hi={filters.naturalMin} live={naturalLive} off={0} fill="above" label="Share of natural ground, at least" ticks={[0, 5, 9]} />
    </div>
    {/if}
    {#if show("sleep")}
    <div class="group" role="group" aria-labelledby={`${idPrefix}g-sleep`}>
      <div class="legend" id={`${idPrefix}g-sleep`}>
        <Explain id={`${idPrefix}x-sleep`} term="Where to sleep">
          <p>A trail matches if it offers every kind you pick.</p>
          <dl>
            {#each sleepingOptions as c}<dt>{c.label}</dt><dd>{c.hint}</dd>{/each}
          </dl>
        </Explain>
      </div>
      <div class="chips">
        {#each sleepingOptions as c}
          {@const off = dead(filters.sleep.includes(c.id), { sleep: toggle(filters.sleep, c.id) })}
          <button type="button" class="chip" aria-pressed={filters.sleep.includes(c.id)} disabled={off} title={off ? NONE : undefined} onclick={() => (filters.sleep = toggle(filters.sleep, c.id))}>{c.label}</button>
        {/each}
      </div>
    </div>
    {/if}

    {#if show("wild")}
    <div class="group" role="group" aria-labelledby={`${idPrefix}g-wild`}>
      <div class="legend" id={`${idPrefix}g-wild`}>
        <Explain id={`${idPrefix}x-wild`} term="Wild camping">
          <dl>
            <dt>Possible</dt><dd>Allowed, or allowed only in certain places or under rules, such as designated bivouac sites.</dd>
            <dt>Allowed</dt><dd>Pitching a tent outside campsites is allowed along the trail.</dd>
          </dl>
          <p>Each trail page gives the exact rule.</p>
        </Explain>
      </div>
      <div class="segmented" role="radiogroup" aria-labelledby={`${idPrefix}g-wild`}>
        <button type="button" role="radio" aria-checked={filters.wild === ""} disabled={dead(filters.wild === "", { wild: "" })} title={dead(filters.wild === "", { wild: "" }) ? NONE : undefined} onclick={() => (filters.wild = "")}>Any</button>
        <button type="button" role="radio" aria-checked={filters.wild === "some"} disabled={dead(filters.wild === "some", { wild: "some" })} title={dead(filters.wild === "some", { wild: "some" }) ? NONE : undefined} onclick={() => (filters.wild = "some")}>Possible</button>
        <button type="button" role="radio" aria-checked={filters.wild === "allowed"} disabled={dead(filters.wild === "allowed", { wild: "allowed" })} title={dead(filters.wild === "allowed", { wild: "allowed" }) ? NONE : undefined} onclick={() => (filters.wild = "allowed")}>Allowed</button>
      </div>
    </div>
    {/if}

    {#if show("water")}
    <div class="group" role="group" aria-labelledby={`${idPrefix}g-water`}>
      <div class="legend" id={`${idPrefix}g-water`}>
        <Explain id={`${idPrefix}x-water`} term="Drinking water" title="Drinking water">
          <p>The longest stretch of the main route without drinking water (taps, fountains and drinking springs mapped in OpenStreetMap) must be at most this long.</p>
          <p>Trail pages rate it in three steps:</p>
          <dl>
            {#each WATER_LEVELS as l}<dt>{l.label}</dt><dd>{l.hint}.</dd>{/each}
          </dl>
        </Explain>
        <span class="value">{waterText(filters)}</span>
      </div>
      <Range stops={WATER_STOPS} bind:hi={filters.waterMax} live={waterLive} off={WATER_KM.length} label="Longest stretch without drinking water, at most" ticks={[0, 3, WATER_KM.length]} />
    </div>
    {/if}

</div>

<style>
  .panel {
    display: grid;
    gap: 20px;
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
  .place + .place {
    margin-top: 10px;
  }
  .countries {
    margin: 6px 0 0 14px;
  }
  .chip.included {
    border-color: color-mix(in srgb, var(--accent) 45%, var(--line));
    background: var(--accent-soft);
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
  .chip:hover:not(:disabled) {
    border-color: var(--muted);
  }
  /* would leave no trail with the other filters */
  .chip:disabled,
  .segmented button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
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
  /* the difficulty group: one small label and value over each slider */
  .sub {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
    margin: 14px 0 4px;
    font-size: 0.85rem;
  }
  .legend + .sub {
    margin-top: 0;
  }
  .sub .value {
    color: var(--muted);
    font-size: 0.8rem;
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
  .chip:focus-visible,
  .segmented button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
</style>
