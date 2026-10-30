<script lang="ts">
  // The trail map (issue #33; of three previews, approach B): every trail on one map beside a list
  // of the trails. The list holds every trail, sorted by distance from the map's centre: the trails
  // in view first, then, under "Outside the map view", the rest; a search at its top, like the
  // header search (TrailSearch.astro), narrows it by name or country and suggests countries (a pick
  // frames the map on their trails) and trails (a pick zooms to the route). Moving or zooming the map re-sorts the list; hovering a list entry
  // highlights its route; clicking a trail on the map finds it in the list. Each list entry has two
  // actions: its name opens the trail page, its "Show on map" button zooms to the route; "Show all
  // trails" (beside the zoom buttons) brings back the first view. Trail starts are
  // grouped into clusters where they crowd (a click zooms in), routes show from zoom 4, from
  // /trails/routes.json (src/pages/trails/routes.json.ts). Basemap and theme as in TrailMap.svelte.
  import { onMount } from "svelte";
  import "maplibre-gl/dist/maplibre-gl.css";
  import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
  import type { SearchTrail } from "../lib/search";
  // Lucide icons (ISC): zoom to a trail, and back to all trails
  import locateIcon from "lucide-static/icons/locate-fixed.svg?raw";
  import earthIcon from "lucide-static/icons/earth.svg?raw";

  type Trail = SearchTrail & { startLonLat: [number, number]; level: string | null };
  // `children`: the page's breadcrumb and title, shown at the top of the list column
  let { trails, children }: { trails: Trail[]; children?: import("svelte").Snippet } = $props();

  const STYLES = { light: "https://tiles.openfreemap.org/styles/liberty", dark: "https://tiles.openfreemap.org/styles/dark" };
  type Theme = keyof typeof STYLES;
  const currentTheme = (): Theme => {
    const chosen = document.documentElement.dataset.theme;
    if (chosen === "light" || chosen === "dark") return chosen;
    return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  };
  const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const fmt = (n: number) => n.toLocaleString("en");
  const figures = (t: Trail) =>
    [t.lengthKm !== null && `${fmt(t.lengthKm)} km`, t.days && (t.days[0] === t.days[1] ? `${t.days[0]} days` : `${t.days[0]}–${t.days[1]} days`), t.level]
      .filter(Boolean)
      .join(" · ");

  let container: HTMLDivElement;
  let map: import("maplibre-gl").Map | undefined;
  let maplibreRef: typeof import("maplibre-gl") | undefined;
  // the first view (every trail start) and each trail's route bounds, for the two zoom actions
  let allBounds: [[number, number], [number, number]] | undefined;
  const routeBounds = new Map<string, [[number, number], [number, number]]>();

  // the trails whose start is in view, the map's centre, and the one hovered in the list or picked
  // on the map
  let inView = $state<string[]>(trails.map((t) => t.slug));
  let center = $state<[number, number] | null>(null);
  let hovered = $state<string | null>(null);
  let query = $state("");
  const all = trails.map((t) => t.slug);

  // the list's search: every word must start a word of the trail's names or countries
  const terms = new Map(
    trails.map((t) => [t.slug, [t.name, t.localName ?? "", ...t.aliases, ...t.countries].join(" ").toLowerCase().split(/[\s,/()-]+/)]),
  );
  const found = (t: Trail) => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return words.every((w) => terms.get(t.slug)!.some((x) => x.startsWith(w)));
  };
  // great-circle distance from the map's centre to a trail's start, km
  const km = (a: [number, number], b: [number, number]) => {
    const r = Math.PI / 180;
    const h = Math.sin(((b[1] - a[1]) * r) / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(((b[0] - a[0]) * r) / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(h));
  };
  const sorted = $derived(
    trails
      .filter(found)
      .map((t) => ({ t, here: inView.includes(t.slug), d: center ? km(center, t.startLonLat) : 0 }))
      .sort((a, b) => Number(b.here) - Number(a.here) || a.d - b.d || a.t.name.localeCompare(b.t.name)),
  );
  const firstOutside = $derived(sorted.findIndex((x) => !x.here));

  // suggestions while typing: countries first (with how many trails), then trails by name
  const countries = [...new Set(trails.flatMap((t) => t.countries))].sort((a, b) => a.localeCompare(b));
  const startsWithWords = (text: string, q: string) => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const parts = text.toLowerCase().split(/[\s,/()-]+/);
    return words.length > 0 && words.every((w) => parts.some((x) => x.startsWith(w)));
  };
  const nameTerms = (t: Trail) => [t.name, t.localName ?? "", ...t.aliases].join(" ");
  let open = $state(false);
  let active = $state(0);
  const suggestions = $derived(
    query.trim()
      ? [
          ...countries
            .filter((c) => startsWithWords(c, query))
            .map((c) => ({ kind: "country" as const, id: c, label: c, note: `${trails.filter((t) => t.countries.includes(c)).length} trails` })),
          ...trails
            .filter((t) => startsWithWords(nameTerms(t), query))
            .map((t) => ({ kind: "trail" as const, id: t.slug, label: t.name, note: t.countries.join(", ") })),
        ]
      : [],
  );
  $effect(() => {
    suggestions;
    active = 0;
  });
  function choose(i: number) {
    const s = suggestions[i];
    if (!s) return;
    open = false;
    if (s.kind === "trail") {
      query = s.label;
      zoomTo(s.id);
    } else {
      query = s.label;
      const boxes = trails.filter((t) => t.countries.includes(s.id)).map((t) => routeBounds.get(t.slug) ?? [t.startLonLat, t.startLonLat]);
      if (map && boxes.length)
        map.fitBounds(
          [
            [Math.min(...boxes.map((b) => b[0][0])), Math.min(...boxes.map((b) => b[0][1]))],
            [Math.max(...boxes.map((b) => b[1][0])), Math.max(...boxes.map((b) => b[1][1]))],
          ],
          { padding: 48, maxZoom: 9 },
        );
    }
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === "ArrowDown" && suggestions.length) {
      e.preventDefault();
      open = true;
      active = Math.min(active + 1, suggestions.length - 1);
    } else if (e.key === "ArrowUp" && suggestions.length) {
      e.preventDefault();
      active = Math.max(active - 1, 0);
    } else if (e.key === "Enter" && open && suggestions.length) {
      e.preventDefault();
      choose(active);
    } else if (e.key === "Escape") {
      open = false;
    }
  }

  const startsData = (slugs: string[]) => ({
    type: "FeatureCollection" as const,
    features: trails
      .filter((t) => slugs.includes(t.slug))
      .map((t) => ({ type: "Feature" as const, properties: { slug: t.slug, name: t.name }, geometry: { type: "Point" as const, coordinates: t.startLonLat } })),
  });

  function updateInView() {
    if (!map) return;
    const b = map.getBounds();
    inView = trails.filter((t) => b.contains(t.startLonLat)).map((t) => t.slug);
    const c = map.getCenter();
    center = [c.lng, c.lat];
  }

  // zoom to one trail's route (or its start where no route is drawn); on phones the list sits under
  // the map, so bring the map back into view
  function zoomTo(slug: string) {
    const t = trails.find((x) => x.slug === slug);
    if (!map || !t) return;
    hovered = slug;
    const b = routeBounds.get(slug);
    if (b) map.fitBounds(b, { padding: 48, maxZoom: 11 });
    else map.easeTo({ center: t.startLonLat, zoom: 9 });
    if (container.getBoundingClientRect().top < 0) container.scrollIntoView({ block: "start", behavior: "smooth" });
  }
  function showAll() {
    if (map && allBounds) map.fitBounds(allBounds, { padding: 0 });
  }

  function highlight(slug: string | null) {
    if (!map?.getSource("routes")) return;
    for (const t of trails) map.setFeatureState({ source: "routes", id: t.slug }, { hover: t.slug === slug });
  }
  $effect(() => highlight(hovered));

  onMount(() => {
    let cancelled = false;
    let stopTheme = () => {};
    (async () => {
      const maplibre = await import("maplibre-gl");
      maplibre.setWorkerUrl(workerUrl);
      maplibreRef = maplibre;
      const routes = await fetch("/trails/routes.json").then((r) => r.json());
      if (cancelled) return;
      for (const f of routes.features) {
        const pts = (f.geometry.coordinates as number[][][]).flat();
        const xs = pts.map((p) => p[0]);
        const ys = pts.map((p) => p[1]);
        routeBounds.set(f.properties.slug, [
          [Math.min(...xs), Math.min(...ys)],
          [Math.max(...xs), Math.max(...ys)],
        ]);
      }
      let theme = currentTheme();
      const lons = trails.map((t) => t.startLonLat[0]);
      const lats = trails.map((t) => t.startLonLat[1]);
      allBounds = [
        [Math.min(...lons) - 8, Math.min(...lats) - 4],
        [Math.max(...lons) + 8, Math.max(...lats) + 4],
      ];
      map = new maplibre.Map({
        container,
        style: STYLES[theme],
        bounds: allBounds,
        cooperativeGestures: true,
        attributionControl: { customAttribution: "Routes: OpenStreetMap contributors" },
      });
      map.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");
      // "Show all trails": back to the first view, styled like the zoom buttons
      map.addControl(
        {
          onAdd() {
            const box = document.createElement("div");
            box.className = "maplibregl-ctrl maplibregl-ctrl-group";
            const button = document.createElement("button");
            button.type = "button";
            button.className = "wm-all";
            button.title = "Show all trails";
            button.setAttribute("aria-label", "Show all trails");
            button.innerHTML = earthIcon;
            button.addEventListener("click", showAll);
            box.append(button);
            return box;
          },
          onRemove() {},
        },
        "top-right",
      );
      map.on("style.load", () => {
        if (!map) return;
        const accent = token("--accent");
        const paper = token("--bg");
        const ink = token("--text");
        map.addSource("routes", { type: "geojson", data: routes, promoteId: "slug" });
        map.addLayer({ id: "routes-casing", type: "line", source: "routes", minzoom: 4, layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": paper, "line-width": ["case", ["boolean", ["feature-state", "hover"], false], 9, 6], "line-opacity": 0.9 } });
        map.addLayer({ id: "routes-line", type: "line", source: "routes", minzoom: 4, layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": accent, "line-width": ["case", ["boolean", ["feature-state", "hover"], false], 5, 3] } });
        map.addSource("starts", { type: "geojson", data: startsData(all), cluster: true, clusterRadius: 36, clusterMaxZoom: 6 });
        map.addLayer({ id: "clusters", type: "circle", source: "starts", filter: ["has", "point_count"], paint: { "circle-color": accent, "circle-radius": 15, "circle-stroke-color": paper, "circle-stroke-width": 2 } });
        map.addLayer({ id: "cluster-count", type: "symbol", source: "starts", filter: ["has", "point_count"], layout: { "text-field": ["get", "point_count_abbreviated"], "text-font": ["Noto Sans Bold"], "text-size": 12 }, paint: { "text-color": paper } });
        map.addLayer({ id: "starts", type: "circle", source: "starts", filter: ["!", ["has", "point_count"]], paint: { "circle-color": paper, "circle-radius": 7, "circle-stroke-color": accent, "circle-stroke-width": 3 } });
        map.addLayer({ id: "start-labels", type: "symbol", source: "starts", filter: ["!", ["has", "point_count"]], minzoom: 3, layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Bold"], "text-size": 12, "text-offset": [0, 1.3], "text-anchor": "top" }, paint: { "text-color": ink, "text-halo-color": paper, "text-halo-width": 1.6 } });
        highlight(hovered);
        updateInView();
      });
      // a cluster zooms in; a trail is found in the list
      map.on("click", "clusters", async (e) => {
        const f = e.features?.[0];
        if (!f || !map) return;
        const zoom = await (map.getSource("starts") as import("maplibre-gl").GeoJSONSource).getClusterExpansionZoom(f.properties.cluster_id);
        map.easeTo({ center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom });
      });
      const pick = (e: import("maplibre-gl").MapLayerMouseEvent) => {
        const slug = e.features?.[0]?.properties?.slug as string | undefined;
        if (!slug) return;
        hovered = slug;
        document.getElementById(`wm-${slug}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      };
      map.on("click", "starts", pick);
      map.on("click", "routes-line", pick);
      for (const layer of ["starts", "routes-line", "clusters"]) {
        map.on("mouseenter", layer, () => map && (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", layer, () => map && (map.getCanvas().style.cursor = ""));
      }
      map.on("moveend", updateInView);
      const onTheme = () => {
        const next = currentTheme();
        if (!map || next === theme) return;
        theme = next;
        map.setStyle(STYLES[theme], { diff: false });
      };
      const observer = new MutationObserver(onTheme);
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
      stopTheme = () => observer.disconnect();
    })().catch((error) => console.error("World map failed:", error));
    return () => {
      cancelled = true;
      stopTheme();
      map?.remove();
    };
  });
</script>

<div class="wm">
  <div class="wm-map" bind:this={container} role="region" aria-label="World map of the trails"></div>
  <aside class="wm-side">
    {#if children}<div class="wm-head">{@render children()}</div>{/if}
    <!-- the search, like the header search (TrailSearch.astro): an ARIA combobox with suggestions -->
    <div class="search" onfocusout={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && (open = false)}>
      <label for="wm-search" class="sr-only">Search trails and countries</label>
      <svg class="glass" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path></svg>
      <input
        id="wm-search"
        type="search"
        role="combobox"
        autocomplete="off"
        spellcheck="false"
        aria-autocomplete="list"
        aria-expanded={open && suggestions.length > 0}
        aria-controls="wm-suggestions"
        aria-activedescendant={open && suggestions.length ? `wm-s-${active}` : undefined}
        placeholder="Search a trail or a country"
        bind:value={query}
        oninput={() => (open = true)}
        onfocus={() => query.trim() && (open = true)}
        onkeydown={onKey}
      />
      {#if open && suggestions.length}
        <div class="results" id="wm-suggestions" role="listbox" aria-label="Suggestions">
          {#each suggestions as s, i (s.kind + s.id)}
            {#if i === 0 || suggestions[i - 1].kind !== s.kind}
              <p class="group" role="presentation">{s.kind === "country" ? "Countries" : "Trails"}</p>
            {/if}
            <button
              type="button"
              role="option"
              id={`wm-s-${i}`}
              aria-selected={i === active}
              tabindex="-1"
              onmousedown={(e) => e.preventDefault()}
              onclick={() => choose(i)}
            >
              <span>{s.label}</span>
              <span class="muted">{s.note}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
    <ol class="wm-list" aria-label="Trails, nearest to the map's centre first">
      {#each sorted as { t, here }, i (t.slug)}
        {#if i === firstOutside}
          <li class="wm-divider">{i === 0 ? "None in the map view; the nearest:" : "Outside the map view"}</li>
        {/if}
        <li id={`wm-${t.slug}`} class:on={hovered === t.slug} class:out={!here} onmouseenter={() => (hovered = t.slug)} onmouseleave={() => (hovered = null)}>
          <!-- two actions: the name opens the trail page, the button zooms the map to the route -->
          <a class="wm-entry" href={`/trails/${t.slug}/`}>
            <span class="wm-place">{t.countries.join(", ")}</span>
            <strong class="wm-name">{t.name}</strong>
            <span class="wm-fig">{figures(t)}</span>
          </a>
          <button type="button" class="wm-zoom" title="Show on map" aria-label={`Show ${t.name} on the map`} onclick={() => zoomTo(t.slug)}>
            {@html locateIcon}
          </button>
        </li>
      {:else}
        <li class="wm-none">
          No trail matches "{query}".
          <button type="button" class="wm-link" onclick={() => (query = "")}>Clear the search</button>
        </li>
      {/each}
    </ol>
  </aside>
</div>

<style>
  /* the page between header and footer: the map filling the space, the list column on the right
     (the page passes `full` to Base, so there is no width cap); phones: the map, then the list */
  .wm {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(320px, 400px);
    height: calc(100dvh - 61px);
    border-bottom: 1px solid var(--line);
  }
  .wm-map {
    height: 100%;
    min-height: 0;
    background: var(--surface);
  }
  .wm-side {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 0;
    padding: 12px 16px 0;
    border-left: 1px solid var(--line);
    background: var(--bg);
  }
  .wm-head :global(h1) {
    margin: 4px 0 0;
    font-size: 1.6rem;
  }
  .wm-head :global(.crumbs) {
    margin-top: 0;
  }

  /* the search, as the header's (TrailSearch.astro) */
  .search {
    position: relative;
  }
  .glass {
    position: absolute;
    left: 12px;
    top: 50%;
    width: 16px;
    height: 16px;
    transform: translateY(-50%);
    fill: none;
    stroke: var(--muted);
    stroke-width: 2;
    stroke-linecap: round;
    pointer-events: none;
  }
  input {
    width: 100%;
    padding: 9px 12px 9px 36px;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--bg);
    color: var(--text);
    font: inherit;
    font-size: 0.95rem;
  }
  input::-webkit-search-cancel-button {
    appearance: none;
  }
  input:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .results {
    position: absolute;
    z-index: 20;
    inset: calc(100% + 6px) 0 auto;
    max-height: 360px;
    overflow-y: auto;
    padding: 6px;
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 14px;
    box-shadow: 0 10px 30px rgb(0 0 0 / 0.14);
  }
  .group {
    margin: 6px 10px 4px;
    color: var(--muted);
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  [role="option"] {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    width: 100%;
    padding: 9px 10px;
    border: 0;
    border-radius: 8px;
    background: none;
    color: var(--text);
    font: inherit;
    font-size: 0.95rem;
    text-align: left;
    cursor: pointer;
  }
  [role="option"] .muted {
    font-size: 0.85rem;
    text-align: right;
  }
  [role="option"][aria-selected="true"],
  [role="option"]:hover {
    background: var(--surface);
  }

  /* the list: every trail, nearest to the map's centre first */
  .wm-list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    margin: 0 -16px;
    padding: 0 16px;
    list-style: none;
    border-top: 1px solid var(--text);
  }
  .wm-list li {
    border-bottom: 1px solid var(--line);
  }
  .wm-list li:not(.wm-none):not(.wm-divider) {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
  }
  .wm-list li.on {
    background: var(--surface);
  }
  .wm-entry {
    display: grid;
    gap: 2px;
    padding: 12px 6px;
    color: var(--text);
    text-decoration: none;
  }
  .wm-entry:hover .wm-name,
  .wm-entry:focus-visible .wm-name {
    color: var(--accent);
    text-decoration: underline;
  }
  .wm-place {
    color: var(--muted);
    font-size: 0.8rem;
  }
  .wm-name {
    font-family: var(--serif);
    font-size: 1.1rem;
  }
  .wm-fig {
    color: var(--accent);
    font-size: 0.85rem;
    font-weight: 600;
  }
  /* "Outside the map view": set apart with room above it */
  .wm-divider {
    padding: 36px 6px 8px;
    color: var(--muted);
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .wm-list li.out .wm-entry {
    opacity: 0.75;
  }
  /* "Show on map": a round button, 40 px to tap */
  .wm-zoom {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    margin-right: 6px;
    padding: 0;
    border: 1px solid var(--line);
    border-radius: 50%;
    background: var(--bg);
    color: var(--muted);
    cursor: pointer;
  }
  .wm-zoom:hover,
  .wm-zoom:focus-visible {
    border-color: var(--accent);
    color: var(--accent);
  }
  .wm-zoom :global(svg) {
    width: 18px;
    height: 18px;
  }
  .wm-none {
    padding: 16px 6px;
    color: var(--muted);
  }
  .wm-link {
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent);
    font: inherit;
    text-decoration: underline;
    cursor: pointer;
  }
  /* the map's "Show all trails" control, like the zoom buttons beside it */
  :global(.wm-all) {
    display: grid !important;
    place-items: center;
  }
  :global(.wm-all svg) {
    width: 17px;
    height: 17px;
    color: #333;
  }

  @media (max-width: 899px) {
    .wm {
      grid-template-columns: 1fr;
      height: auto;
    }
    .wm-map {
      height: 62dvh;
    }
    .wm-side {
      border-left: 0;
      padding-bottom: 12px;
    }
    .wm-list {
      overflow: visible;
    }
  }
</style>
