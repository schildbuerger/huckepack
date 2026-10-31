<script lang="ts">
  // The trail search: filters grouped by planning question, in the order a hiker decides (when,
  // where, how long, how hard, what it looks like, the ground, sleeping, wild camping, water)
  // beside a list of result cards. Everything runs in the browser
  // on the summaries built at build time; the filters live in the URL, so a search can be shared.
  import { onMount } from "svelte";
  import { SLEEPING_CATEGORIES } from "../lib/trails";
  import type { SearchTrail } from "../lib/search";
  import {
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

  let { trails, children }: { trails: SearchTrail[]; children?: import("svelte").Snippet } = $props();

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

  // the cards (TrailCards.astro, passed in as children): hide those the filters leave out and move
  // the rest into the sorted order, moving the elements themselves so screen readers and the tab
  // order follow the order on screen
  let cardsHost: HTMLElement;
  $effect(() => {
    const list = cardsHost?.querySelector<HTMLElement>("ol.cards");
    if (!list) return;
    const items = new Map([...list.children].map((li) => [(li as HTMLElement).dataset.slug!, li as HTMLElement]));
    const keep = new Set(shown.map((t) => t.slug));
    for (const [slug, li] of items) li.hidden = !keep.has(slug);
    for (const t of shown) list.append(items.get(t.slug)!);
    list.parentElement!.hidden = shown.length === 0;
  });
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

    <!-- the cards, plain HTML from TrailCards.astro: only hidden and ordered here (issue #86) -->
    <div class="cards-host" bind:this={cardsHost}>{@render children?.()}</div>
    {#if !shown.length}
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
</style>
