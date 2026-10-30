<script lang="ts">
  // The trail map (issue #33; of three previews, approach B): every trail on one map beside a list
  // of the trails. The list holds every trail, sorted by distance from the map's centre: the trails
  // in view first, then, under "Outside the map view", the rest; a search at its top narrows it by
  // name or country. Moving or zooming the map re-sorts the list; hovering a list entry
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
  let { trails }: { trails: Trail[] } = $props();

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

<div class="wm split">
  <div class="wm-map" bind:this={container} role="region" aria-label="World map of the trails"></div>
  <div class="wm-side">
    <label class="wm-search">
      <span class="sr-only">Search the list by trail or country</span>
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path></svg>
      <input type="search" placeholder="Trail or country" bind:value={query} autocomplete="off" spellcheck="false" />
    </label>
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
  </div>
</div>

<style>
  .wm-map {
    height: min(72vh, 680px);
    min-height: 420px;
    border-radius: 14px;
    overflow: hidden;
    background: var(--surface);
  }
  .split {
    display: grid;
    grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
    gap: 16px;
  }
  /* the list's column: the search on top, the list scrolling beneath, together as tall as the map */
  .wm-side {
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-height: min(72vh, 680px);
    min-height: 420px;
  }
  .wm-search {
    position: relative;
  }
  .wm-search svg {
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
  .wm-search input {
    width: 100%;
    padding: 9px 12px 9px 36px;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--bg);
    color: var(--text);
    font: inherit;
  }
  .wm-search input::-webkit-search-cancel-button {
    appearance: none;
  }
  .wm-search input:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
  .wm-divider {
    padding: 14px 10px 6px;
    color: var(--muted);
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  /* trails outside the map view stay listed, a little quieter */
  .wm-list li.out .wm-entry {
    opacity: 0.75;
  }
  .wm-list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    margin: 0;
    padding: 0;
    list-style: none;
    border-top: 1px solid var(--text);
  }
  .wm-list li {
    border-bottom: 1px solid var(--line);
  }
  .wm-list li.on {
    background: var(--surface);
  }
  .wm-list li:not(.wm-none):not(.wm-divider) {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    padding-right: 8px;
  }
  .wm-entry {
    display: grid;
    gap: 2px;
    padding: 12px 10px;
    color: var(--text);
    text-decoration: none;
  }
  .wm-entry:hover .wm-name,
  .wm-entry:focus-visible .wm-name {
    color: var(--accent);
    text-decoration: underline;
  }
  /* "Show on map": a round button, 40 px to tap */
  .wm-zoom {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
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
  .wm-none {
    padding: 16px 10px;
    color: var(--muted);
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
  @media (max-width: 899px) {
    .split {
      grid-template-columns: 1fr;
    }
    .wm-side {
      max-height: none;
      min-height: 0;
    }
    .wm-list {
      max-height: none;
    }
  }
</style>
