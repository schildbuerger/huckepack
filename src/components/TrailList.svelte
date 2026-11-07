<script lang="ts">
  // The trail search: filters grouped by planning question, in the order a hiker decides (when,
  // where, how long, how hard, what it looks like, the ground, sleeping, wild camping, water)
  // beside a compare table of the results (2026-11-05, approach C of five previews): a header row
  // whose columns sort, above the rows (TrailCards.astro) on the same grid. Everything runs in the browser
  // on the summaries built at build time; the filters live in the URL, so a search can be shared.
  import { onMount } from "svelte";
  import { SLEEPING_CATEGORIES } from "../lib/trails";
  import type { SearchTrail } from "../lib/search";
  import { loadTrails } from "../lib/search-data";
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
  import { PER_PAGE, PER_PAGE_OPTIONS, pageCount, pagePath } from "../lib/pages";

  // the trails' summaries come from /trails/search.json, not the page's HTML (issue #93); `total` for
  // the count until they're in; `more`: the page carries only the first cards, the rest come with
  // /trails/cards.html
  // `page`: the page this HTML is (src/layouts/TrailsListing.astro), the list's page until a filter, a
  // sort or another page size starts it again at 1
  let { total = 0, more = false, page: firstPage = 1, children }: { total?: number; more?: boolean; page?: number; children?: import("svelte").Snippet } = $props();
  // raw: replaced whole, never changed in place, so no deep proxy over every trail's figures (the
  // filter panel reads them for each option's count; the proxy made that the page's slowest work)
  let trails = $state.raw<SearchTrail[]>([]);
  let cardsIn = $state(0); // how many times cards were added, so the order is applied to them too
  // every card is in the page (its own, and /trails/cards.html's): until then the pager's links load
  // their pages as plain links, so a click never shows an empty page
  let cardsReady = false;

  // the hardest of a trail's three ratings, climate for the months picked (else its best run of
  // season months, issue #114), for sorting
  const hardest = (t: SearchTrail) => {
    const xs = [t.terrainLevel, t.effortLevel, climateLevel(t, filters.months)].filter((x) => x !== null) as number[];
    return xs.length ? Math.max(...xs) : null;
  };
  const SORTS = {
    name: { label: "Name", value: (t: SearchTrail) => t.name },
    // newest added first (issue #218; the home page's logbook links here with sort=newest)
    newest: { label: "Newest first", value: (t: SearchTrail) => -Date.parse(t.added) },
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
  // the table's columns: each header sorts by one of the orders (Length toggles shortest/longest)
  const COLUMNS: { label: string; sorts: SortKey[]; num?: boolean; title?: string }[] = [
    { label: "Trail", sorts: ["name"] },
    { label: "Length", sorts: ["shortest", "longest"], num: true },
    { label: "Days", sorts: ["days"], num: true },
    { label: "Ascent", sorts: ["flattest"], num: true, title: "Sorts by the least climbing per km" },
    { label: "Difficulty", sorts: ["easiest"] },
    { label: "Season", sorts: [] },
    { label: "Profile and ground", sorts: ["natural"], title: "Sorts by the most natural ground" },
  ];
  const sortColumn = (c: (typeof COLUMNS)[number]) => {
    if (!c.sorts.length) return;
    sort = c.sorts.length > 1 && sort === c.sorts[0] ? c.sorts[1] : c.sorts[0];
  };
  const ariaSort = (c: (typeof COLUMNS)[number]) =>
    !c.sorts.includes(sort) ? "none" : sort === "longest" || sort === "natural" ? "descending" : "ascending";

  // filter state (src/lib/filters.ts; sliders hold stop indexes), each filter a URL parameter;
  // the controls are FilterPanel.svelte, shared with the trail map
  let filters = $state<Filters>(noFilters());
  let sort = $state<SortKey>("name");
  let filtersOpen = $state(false);
  let ready = false;
  // pagination: the page shown and the page size (the query's `per`, else the visitor's choice kept in
  // the browser, else PER_PAGE)
  // svelte-ignore state_referenced_locally
  let page = $state(firstPage);
  let per = $state<number>(PER_PAGE);
  const PER_KEY = "trails:per";

  const sleepingOptions = SLEEPING_CATEGORIES.filter((c) => c.id !== "wild-camping");

  onMount(() => {
    const p = new URLSearchParams(location.search);
    filters = fromParams(
      p,
      sleepingOptions.map((c) => c.id),
    );
    sort = (p.get("sort") ?? "") in SORTS ? (p.get("sort") as SortKey) : "name";
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(PER_KEY);
    } catch {}
    const asked = Number(p.get("per") ?? stored);
    if ((PER_PAGE_OPTIONS as readonly number[]).includes(asked)) per = asked;
    restartKey = listKey();
    ready = true;
    // back and forward between pages: each page is its own address, so load it
    addEventListener("popstate", () => location.reload());
    loadTrails().then((t) => {
      trails = t;
      if (!more) cardsReady = true;
    });
  });

  // every other trail's card (/trails/cards.html), fetched only when the list needs more than this
  // page's own (a filter, a sort, another page or page size; or the pointer reaching the pager), so a
  // plain visit doesn't download and lay out every card (the page's performance, 2026-11-06)
  let cardsLoading: Promise<void> | null = null;
  function loadCards() {
    if (!more || cardsLoading) return;
    cardsLoading = (async () => {
      const html = await fetch("/trails/cards.html").then((r) => (r.ok ? r.text() : ""));
      const list = cardsHost?.querySelector<HTMLElement>("ol.cards");
      const extra = new DOMParser().parseFromString(html, "text/html").querySelector("ol.cards");
      if (list && extra) {
        // the cards this page doesn't carry itself
        const have = new Set([...list.children].map((li) => (li as HTMLElement).dataset.slug));
        list.append(...[...extra.children].filter((li) => !have.has((li as HTMLElement).dataset.slug)));
        cardsIn++;
        cardsReady = true;
      }
    })();
  }
  $effect(() => {
    if (trails.length && (active.length > 0 || sort !== "name" || per !== PER_PAGE || page !== firstPage)) loadCards();
  });

  // keep the URL in step with the filters (replace, not push: the back button leaves the page)
  // the query string for the list as it is (filters, sort, page size), kept on every page's address
  const query = () => {
    const p = toParams(filters);
    if (sort !== "name") p.set("sort", sort);
    if (per !== PER_PAGE) p.set("per", String(per));
    const q = p.toString();
    return q ? `?${q}` : "";
  };
  const pageHref = (n: number) => pagePath(n) + query();
  $effect(() => {
    const href = pageHref(page);
    if (!ready) return;
    history.replaceState(null, "", href);
  });
  // a filter, a sort or another page size starts the list again at page 1
  const listKey = () => `${toParams(filters)}|${sort}|${per}`;
  let restartKey = "";
  $effect(() => {
    const key = listKey();
    if (!ready || key === restartKey) return;
    restartKey = key;
    page = 1;
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

  // the pages: before the trails are in (and on the server), the page's own count of all trails
  let pages = $derived(trails.length ? pageCount(shown.length, per) : pageCount(total));
  // a page past the end (a filter left fewer): the last one
  $effect(() => {
    if (trails.length && page > pages) page = pages;
  });
  let firstShown = $derived((page - 1) * per + 1);
  let lastShown = $derived(Math.min(page * per, trails.length ? shown.length : total));
  // the pager's numbers: all of them up to seven pages, else the first, the last and the current
  // one's neighbours, with gaps (null) between
  let pageList = $derived.by(() => {
    if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
    // three numbers round the current page, the first and the last; near either end, the first or last five
    const from = page <= 3 ? 2 : page >= pages - 2 ? pages - 3 : page - 1;
    const middle = [from, from + 1, from + 2];
    return [1, ...(from > 2 ? [null] : []), ...middle, ...(from + 2 < pages - 1 ? [null] : []), pages];
  });
  function goTo(n: number, e: MouseEvent) {
    // a new tab or window keeps the browser's own way
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0 || !cardsReady) return;
    e.preventDefault();
    page = n;
    history.pushState(null, "", pageHref(n));
    cardsHost?.closest(".results")?.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }
  function setPer(n: number) {
    per = n;
    try {
      localStorage.setItem(PER_KEY, String(n));
    } catch {}
  }

  // the active filters as removable chips
  let active = $derived(
    activeFilters(filters, sleepingOptions).map((a) => ({ label: a.label, clear: () => Object.assign(filters, a.reset) })),
  );

  function reset() {
    filters = noFilters();
  }

  // the title band's number (TrailsListing.astro, outside this island) follows the filters: the
  // trails that match, all of them with none set; the server's total until the trails are in. Not a
  // live region: the screen-reader status line below announces the count once
  $effect(() => {
    const n = trails.length ? shown.length : total;
    const num = document.querySelector("[data-trail-count]");
    const word = document.querySelector("[data-trail-word]");
    if (num) num.textContent = String(n);
    if (word) word.textContent = n === 1 ? "trail" : "trails";
  });

  // the cards (TrailCards.astro, passed in as children): hide those the filters leave out and move
  // the rest into the sorted order, moving the elements themselves so screen readers and the tab
  // order follow the order on screen
  let cardsHost: HTMLElement;
  $effect(() => {
    const list = cardsHost?.querySelector<HTMLElement>("ol.cards");
    if (!list || !trails.length) return;
    void cardsIn;
    const items = new Map([...list.children].map((li) => [(li as HTMLElement).dataset.slug!, li as HTMLElement]));
    const keep = new Set(shown.slice((page - 1) * per, page * per).map((t) => t.slug));
    for (const [slug, li] of items) li.hidden = !keep.has(slug);
    // cards beyond the first ones arrive a moment after the trails (/trails/cards.html): skip them until then
    for (const t of shown) {
      const li = items.get(t.slug);
      if (li) list.append(li);
    }
    list.parentElement!.hidden = shown.length === 0;
  });
</script>

<div class="layout">
  <aside class="filters" class:open={filtersOpen} aria-label="Filters">
    <div class="filters-head">
      <h2>Filters</h2>
      <!-- always in the layout, only hidden, so showing it doesn't shift the filters below -->
      <button type="button" class="link" class:hidden={!active.length} onclick={reset}>Clear all</button>
      <button type="button" class="close" onclick={() => (filtersOpen = false)}>Show {trails.length ? shown.length : total} {(trails.length ? shown.length : total) === 1 ? "trail" : "trails"}</button>
    </div>

    <FilterPanel {trails} bind:filters collapsible />
  </aside>

  <div class="results">
    <div class="bar">
      <p class="count">
        <!-- the result count for screen readers, announced as the filters change; on screen the title
             band's number says it (TrailsListing.astro, set by the effect above), so only the map link shows -->
        <span class="sr-only" role="status">{#if active.length}{shown.length} of {trails.length || total} {(trails.length || total) === 1 ? "trail" : "trails"}{:else}{trails.length || total} {(trails.length || total) === 1 ? "trail" : "trails"}{/if}</span>
        <!-- the trail map (issue #33), a quiet way to the same trails by place, with the same filters -->
        <a class="map-link" href={`/trails/map/${toParams(filters).toString() ? `?${toParams(filters)}` : ""}`}>Map view <span aria-hidden="true">→</span></a>
      </p>
      <label class="sort per">
        <span class="sort-word">Per page</span>
        <select value={per} onchange={(e) => setPer(Number((e.currentTarget as HTMLSelectElement).value))}>
          {#each PER_PAGE_OPTIONS as n}<option value={n}>{n}</option>{/each}
        </select>
      </label>
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

    <!-- the table's header: each column sorts (the rows below share its grid, --cols) -->
    <div class="thead">
      {#each COLUMNS as c}
        <span class="th" class:num={c.num}>
          {#if c.sorts.length}
            <button type="button" class:on={c.sorts.includes(sort)} aria-pressed={c.sorts.includes(sort)} title={c.title} onclick={() => sortColumn(c)}>
              {c.label}<span class="sr-only">{c.sorts.includes(sort) ? `, sorted ${ariaSort(c)}` : ", sort by this"}</span><span class="arrow" aria-hidden="true">{!c.sorts.includes(sort) ? "↕" : ariaSort(c) === "descending" ? "↓" : "↑"}</span>
            </button>
          {:else}
            <span class="th-plain">{c.label}</span>
          {/if}
        </span>
      {/each}
    </div>
    <!-- the rows, plain HTML from TrailCards.astro: only hidden and ordered here (issue #86) -->
    <div class="cards-host" bind:this={cardsHost}>{@render children?.()}</div>
    <!-- the pager: plain links to each page's own address (crawlers follow them; the browser pages in
         place, keeping the filters), shown while there's more than one page -->
    {#if pages > 1}
      <nav class="pager" aria-label="Pages of trails" onpointerenter={loadCards} onfocusin={loadCards}>
        <p class="range">{firstShown}–{lastShown} of {trails.length ? shown.length : total}</p>
        <ol>
          <li class="step">
            {#if page > 1}<a href={pageHref(page - 1)} rel="prev" onclick={(e) => goTo(page - 1, e)}><span aria-hidden="true">←</span> Previous</a>{:else}<span class="off" aria-hidden="true">← Previous</span>{/if}
          </li>
          {#each pageList as n}
            <li>
              {#if n === null}<span class="gap" aria-hidden="true">…</span>
              {:else if n === page}<span class="now" aria-current="page"><span class="sr-only">Page </span>{n}</span>
              {:else}<a href={pageHref(n)} onclick={(e) => goTo(n, e)}><span class="sr-only">Page </span>{n}</a>{/if}
            </li>
          {/each}
          <li class="step">
            {#if page < pages}<a href={pageHref(page + 1)} rel="next" onclick={(e) => goTo(page + 1, e)}>Next <span aria-hidden="true">→</span></a>{:else}<span class="off" aria-hidden="true">Next →</span>{/if}
          </li>
        </ol>
      </nav>
    {/if}
    {#if trails.length && !shown.length}
      <div class="empty">
        <p><strong>No trails match all of these filters.</strong></p>
        <p class="muted">Remove one of the filters above, or <button type="button" class="link" onclick={reset}>clear them all</button>.</p>
      </div>
    {/if}
  </div>
</div>

<style>
  /* the compare table's columns, shared by the header here and the rows (TrailCards.astro) */
  .results {
    --cols: minmax(220px, 3fr) 60px 44px 70px 112px 80px minmax(100px, 1.1fr);
    --col-gap: 14px;
  }
  .thead {
    position: sticky;
    top: 0;
    z-index: 3;
    display: grid;
    grid-template-columns: var(--cols);
    column-gap: var(--col-gap);
    align-items: end;
    margin-top: 16px;
    padding: 6px 8px;
    border-bottom: 2px solid var(--text);
    background: var(--bg);
  }
  .th {
    min-width: 0;
  }
  .th.num {
    text-align: right;
  }
  .th button,
  .th-plain {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    min-height: 28px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--muted);
    font: 600 0.78rem var(--sans);
    text-align: inherit;
    cursor: pointer;
  }
  .th-plain {
    cursor: default;
  }
  .th button:hover,
  .th button.on {
    color: var(--text);
  }
  .th button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .arrow {
    color: var(--muted);
    font-size: 0.75rem;
    opacity: 0.6;
  }
  .th button.on .arrow {
    opacity: 1;
    color: var(--accent-text);
  }
  /* phones: no header row (the rows fold into cards and label their figures); the sort menu instead */
  @media (max-width: 759px) {
    .thead {
      display: none;
    }
  }

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
    color: var(--accent-text);
    font: inherit;
    font-size: 0.85rem;
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  /* the pager: page numbers as small round links, the current one filled, Previous and Next beside */
  .pager {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin: 24px 0 0;
    padding-top: 16px;
    border-top: 1px solid var(--line);
  }
  .range {
    margin: 0;
    color: var(--muted);
    font-size: 0.85rem;
  }
  .pager ol {
    display: flex;
    align-items: center;
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .pager a,
  .pager .now,
  .pager .off,
  .pager .gap {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    white-space: nowrap;
    min-width: 34px;
    height: 34px;
    padding: 0 10px;
    border-radius: 999px;
    font-size: 0.9rem;
    text-decoration: none;
  }
  .pager a {
    color: var(--text);
  }
  .pager a:hover {
    background: var(--surface);
  }
  .pager a:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .pager .now {
    background: var(--accent);
    color: var(--bg);
    font-weight: 600;
  }
  /* inactive Previous/Next and the gap: the muted text colour, without fading it further (opacity
     brought it to 2.5:1, below the 4.5:1 Lighthouse's contrast check needs) */
  .pager .off,
  .pager .gap {
    color: var(--muted);
  }
  .pager .step a,
  .pager .step .off {
    padding: 0 14px;
  }
  @media (max-width: 559px) {
    .pager .step a,
    .pager .step .off {
      font-size: 0;
      padding: 0;
    }
    .pager .step a span,
    .pager .step .off {
      font-size: 0.9rem;
    }
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
