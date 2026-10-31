<script lang="ts">
  // The trail map (issue #33): every trail on one map beside a list of the trails. The list holds
  // every trail the filters leave, sorted by distance from you (the main city of the browser's time
  // zone, as the home page's "Trails near you"; else from the map's centre); the first view is centred on you, wide
  // enough for the nearest trails; a search at its top, like the header search
  // (TrailSearch.astro), narrows it by name or country and suggests countries (a pick frames the map
  // on their trails) and trails (a pick zooms to the route). The search page's filters
  // (FilterPanel.svelte) sit as one button per planning question along the map's top, in the same URL
  // parameters as the search page; trails they leave out leave the map and the list, and the map
  // frames the rest. Without your place, moving or zooming the map re-sorts the list (a pick keeps
  // it); hovering a list
  // entry highlights its route; clicking a trail on the map finds it in the list. Each list entry has
  // two actions: the entry zooms to the route and opens a preview card (TrailPreview.svelte), the
  // arrow opens the trail page; "Show all trails" (beside the zoom buttons) frames every matching
  // trail. Trail starts are grouped into clusters where they crowd (a click zooms in), routes show
  // from zoom 4, from /trails/routes.json (src/pages/trails/routes.json.ts). Basemap and theme as in
  // TrailMap.svelte.
  import { onMount, tick } from "svelte";
  import TrailPreview from "./TrailPreview.svelte";
  import FilterPanel from "./FilterPanel.svelte";
  import { SLEEPING_CATEGORIES } from "../lib/trails";
  import {
    activeFilters,
    daysText,
    fromParams,
    levelText,
    matches,
    monthList,
    noFilters,
    toParams,
    waterText,
    naturalText,
    type Filters,
  } from "../lib/filters";
  import "maplibre-gl/dist/maplibre-gl.css";
  import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
  import { STYLES, currentTheme, token, watchTheme } from "../lib/map-theme";
  import zones from "../lib/timezones.json";
  import { kmBetween as km, roundDistance } from "../lib/geo";
  import type { SearchTrail } from "../lib/search";
  // Lucide icons (ISC): zoom to a trail, and back to all trails
  import openIcon from "lucide-static/icons/arrow-right.svg?raw";
  import earthIcon from "lucide-static/icons/earth.svg?raw";

  type Trail = SearchTrail & { startLonLat: [number, number]; level: string | null };
  // `children`: the page's breadcrumb and title, shown at the top of the list column
  let {
    trails,
    children,
  }: { trails: Trail[]; children?: import("svelte").Snippet } = $props();

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

  // the trails whose start is in view, the map's centre, the one hovered in the list, and the one
  // picked (in the list, the search or on the map; it stays marked until another pick or "Show all")
  let center = $state<[number, number] | null>(null);
  // where you are, as far as the browser's time zone tells (its main city, [lon, lat]); worked out
  // here, nothing is sent or stored
  let here = $state<[number, number] | null>(null);
  let failed = $state(false);
  let hovered = $state<string | null>(null);
  let selected = $state<string | null>(null);
  let query = $state("");
  const all = trails.map((t) => t.slug);

  // the search page's filters (src/lib/filters.ts, FilterPanel.svelte), in the URL with the same
  // parameters, so "Map view" and "List view" carry them across; trails that don't match leave the
  // map and the list
  const sleepingOptions = SLEEPING_CATEGORIES.filter((c) => c.id !== "wild-camping");
  let filters = $state<Filters>(noFilters());
  let filtersReady = $state(false);
  const matching = $derived(trails.filter((t) => matches(t, filters)));
  const matchSet = $derived(new Set(matching.map((t) => t.slug)));
  const chips = $derived(
    activeFilters(filters, sleepingOptions).map((a) => ({ label: a.label, clear: () => Object.assign(filters, a.reset) })),
  );
  const listHref = $derived(`/trails/${toParams(filters).toString() ? `?${toParams(filters)}` : ""}`);
  // the map's filter buttons: each opens one or two of the panel's groups
  const BAR = [
    { id: "when", label: "When", groups: ["when"], on: (f: Filters) => (f.months.length ? monthList(f.months) : "") },
    { id: "where", label: "Where", groups: ["where"], on: (f: Filters) => f.where.join(", ") },
    { id: "days", label: "How long", groups: ["days"], on: (f: Filters) => (daysText(f) === "Any length" ? "" : daysText(f)) },
    {
      id: "hard",
      label: "How hard",
      groups: ["hard"],
      on: (f: Filters) =>
        [
          ["Terrain", f.terrainMin, f.terrainMax],
          ["Climate", f.climateMin, f.climateMax],
          ["Effort", f.effortMin, f.effortMax],
        ]
          .filter(([, a, b]) => levelText(a as number, b as number) !== "Any")
          .map(([l, a, b]) => `${l} ${levelText(a as number, b as number).toLowerCase()}`)
          .join(", "),
    },
    { id: "land", label: "Landscape", groups: ["land", "ground"], on: (f: Filters) => [f.land.length ? `${f.land.length} picked` : "", naturalText(f) !== "Any" ? naturalText(f) : ""].filter(Boolean).join(", ") },
    { id: "sleep", label: "Nights", groups: ["sleep", "wild"], on: (f: Filters) => [f.sleep.length ? `${f.sleep.length} kinds` : "", f.wild ? "wild camping" : ""].filter(Boolean).join(", ") },
    { id: "water", label: "Water", groups: ["water"], on: (f: Filters) => (waterText(f) === "Any" ? "" : waterText(f)) },
  ] as const;
  let barOpen = $state<string | null>(null);
  let barH = $state(0);

  // the list's search: every word must start a word of the trail's names or countries
  const terms = new Map(
    trails.map((t) => [t.slug, [t.name, t.localName ?? "", ...t.aliases, ...t.countries].join(" ").toLowerCase().split(/[\s,/()-]+/)]),
  );
  const found = (t: Trail) => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return words.every((w) => terms.get(t.slug)!.some((x) => x.startsWith(w)));
  };
  const sorted = $derived(
    trails
      .filter((t) => matchSet.has(t.slug) && found(t))
      .map((t) => {
        const from = here ?? center;
        return { t, d: from ? km(from, t.startLonLat) : 0 };
      })
      .sort((a, b) => a.d - b.d || a.t.name.localeCompare(b.t.name)),
  );
  const fromYou = (d: number) => `≈ ${fmt(roundDistance(d))} km from you`;

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
      selected = null;
      listKept = true;
      frame(matching.filter((t) => t.countries.includes(s.id)));
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

  // without your place the list is sorted from the map's centre, re-sorted after the map moved;
  // after a pick from the list or the search the list stays as it was while the map shows the
  // chosen trail, until the hiker moves the map (a drag, wheel or button: the event has an
  // `originalEvent`) or asks for all trails or a cluster (`resetList`); a resize or a reload of the
  // map's style (a theme switch) doesn't count
  let listKept = false;
  let framedOnce = false;
  function updateCenter(e?: { originalEvent?: unknown; resetList?: boolean }) {
    if (!map) return;
    if (listKept && !e?.originalEvent && !e?.resetList) return;
    listKept = false;
    const c = map.getCenter();
    center = [c.lng, c.lat];
  }

  // the room the panels over the map leave (the preview card, the filter buttons): the map
  // frames trails beside them. A tall panel takes its side (left or right), a wide one its edge (top
  // or bottom); the map keeps at least 120 × 100 px
  let mapWrap: HTMLDivElement;
  function framePadding() {
    const p = { top: 48, right: 48, bottom: 48, left: 48 };
    if (!mapWrap) return p;
    const m = container.getBoundingClientRect();
    for (const el of mapWrap.querySelectorAll<HTMLElement>(".tp, .wm-over")) {
      const c = el.getBoundingClientRect();
      if (!c.width || c.left >= m.right - 1 || c.right <= m.left + 1 || c.top >= m.bottom - 1 || c.bottom <= m.top + 1) continue;
      if (c.height > m.height * 0.6) {
        if (c.left + c.width / 2 < m.left + m.width / 2) p.left = Math.max(p.left, c.right - m.left + 24);
        else p.right = Math.max(p.right, m.right - c.left + 24);
      } else if (c.top + c.height / 2 < m.top + m.height / 2) p.top = Math.max(p.top, c.bottom - m.top + 24);
      else p.bottom = Math.max(p.bottom, m.bottom - c.top + 24);
    }
    const shrink = (a: "left" | "right" | "top" | "bottom", b: "left" | "right" | "top" | "bottom", room: number) => {
      const over = p[a] + p[b] - room;
      if (over > 0) [p[a], p[b]] = [Math.max(0, p[a] - over / 2), Math.max(0, p[b] - over / 2)];
    };
    shrink("left", "right", m.width - 120);
    shrink("top", "bottom", m.height - 100);
    return p;
  }
  // fit the map to some trails (their routes, else their starts) in the room the panels leave
  function frame(ts: Trail[], eventData: object = {}) {
    if (!map || !ts.length) return;
    const boxes = ts.map((t) => routeBounds.get(t.slug) ?? [t.startLonLat, t.startLonLat]);
    map.fitBounds(
      [
        [Math.min(...boxes.map((b) => b[0][0])), Math.min(...boxes.map((b) => b[0][1]))],
        [Math.max(...boxes.map((b) => b[1][0])), Math.max(...boxes.map((b) => b[1][1]))],
      ],
      { padding: framePadding(), maxZoom: 9 },
      eventData,
    );
  }

  // the first view where your place is known: centred on it, wide enough for the nearest trails
  const NEAREST = 3;
  function aroundHere(ts: Trail[]): [[number, number], [number, number]] | null {
    if (!here || !ts.length) return null;
    const [lon, lat] = here;
    const near = [...ts].sort((a, b) => km(here!, a.startLonLat) - km(here!, b.startLonLat)).slice(0, NEAREST);
    const dx = Math.min(Math.max(...near.map((t) => Math.abs(t.startLonLat[0] - lon))) * 1.15 + 0.5, 170);
    const dy = Math.max(...near.map((t) => Math.abs(t.startLonLat[1] - lat))) * 1.15 + 0.3;
    return [
      [lon - dx, Math.max(lat - dy, -80)],
      [lon + dx, Math.min(lat + dy, 80)],
    ];
  }

  // zoom to one trail's route (or its start where no route is drawn), once its preview is shown
  async function zoomTo(slug: string) {
    const t = trails.find((x) => x.slug === slug);
    if (!map || !t) return;
    selected = slug;
    listKept = true;
    await tick();
    map.resize();
    const padding = framePadding();
    const b = routeBounds.get(slug);
    if (b) map.fitBounds(b, { padding, maxZoom: 11 });
    else map.easeTo({ center: t.startLonLat, zoom: 9, padding });
  }
  const picked = $derived(trails.find((t) => t.slug === selected) ?? null);
  async function closePreview() {
    selected = null;
    await tick();
    map?.resize();
    map?.easeTo({ padding: { top: 0, right: 0, bottom: 0, left: 0 } });
  }
  async function showAll() {
    selected = null;
    await tick();
    map?.resize();
    if (!map) return;
    if (matching.length === trails.length && allBounds) map.fitBounds(allBounds, { padding: 0 }, { resetList: true });
    else frame(matching, { resetList: true });
  }

  // the filters: read from the URL once, written back on change; the map shows only the matching
  // trails and, a moment after the filters change, frames them
  function applyFilters() {
    if (!map?.getSource("starts")) return;
    const slugs = [...matchSet];
    (map.getSource("starts") as import("maplibre-gl").GeoJSONSource).setData(startsData(slugs));
    for (const id of ["routes-casing", "routes-line"]) map.setFilter(id, ["in", ["get", "slug"], ["literal", slugs]]);
  }
  $effect(() => {
    matchSet;
    applyFilters();
    if (selected && !matchSet.has(selected)) selected = null;
  });
  $effect(() => {
    const search = toParams(filters).toString();
    if (!filtersReady) return;
    history.replaceState(null, "", search ? `?${search}` : location.pathname);
  });
  let frameTimer: ReturnType<typeof setTimeout> | undefined;
  let lastMatch: string | undefined;
  $effect(() => {
    const key = [...matchSet].join();
    if (!filtersReady || key === lastMatch) return;
    const first = lastMatch === undefined;
    lastMatch = key;
    if (first) return; // the first view: framed when the map is ready (style.load)
    clearTimeout(frameTimer);
    frameTimer = setTimeout(() => !selected && (matching.length === trails.length ? showAll() : frame(matching, { resetList: true })), 450);
  });

  // the hovered and the picked trail's routes are drawn thicker
  function highlight(...slugs: (string | null)[]) {
    if (!map?.getSource("routes")) return;
    for (const t of trails) map.setFeatureState({ source: "routes", id: t.slug }, { hover: slugs.includes(t.slug) });
  }
  $effect(() => highlight(hovered, selected));

  onMount(() => {
    filters = fromParams(
      new URLSearchParams(location.search),
      sleepingOptions.map((c) => c.id),
    );
    filtersReady = true;
    const zone = (zones as Record<string, [number, number]>)[Intl.DateTimeFormat().resolvedOptions().timeZone];
    if (zone) here = [zone[1], zone[0]];
    // a filter button's group closes with Esc or a click elsewhere
    const closeBar = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !(e.target as Element).closest?.(".wm-bar")) barOpen = null;
    };
    document.addEventListener("pointerdown", closeBar);
    document.addEventListener("keydown", closeBar);
    let cancelled = false;
    let stopTheme = () => {};
    (async () => {
      const maplibre = await import("maplibre-gl");
      maplibre.setWorkerUrl(workerUrl);
      maplibreRef = maplibre;
      const routes = await fetch("/trails/routes.json").then((r) => {
        if (!r.ok) throw new Error(`routes: HTTP ${r.status}`);
        return r.json();
      });
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
        bounds: aroundHere(matching) ?? allBounds,
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
        applyFilters();
        highlight(hovered, selected);
        updateCenter();
        if (!framedOnce) {
          const b = aroundHere(matching);
          if (b) map.fitBounds(b, { padding: framePadding(), maxZoom: 7, animate: false }, { resetList: true });
          else if (matching.length < trails.length) frame(matching, { resetList: true });
        }
        framedOnce = true;
      });
      // a cluster zooms in; a trail is found in the list
      map.on("click", "clusters", async (e) => {
        const f = e.features?.[0];
        if (!f || !map) return;
        const zoom = await (map.getSource("starts") as import("maplibre-gl").GeoJSONSource).getClusterExpansionZoom(f.properties.cluster_id);
        map.easeTo({ center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom }, { resetList: true });
      });
      const pick = (e: import("maplibre-gl").MapLayerMouseEvent) => {
        const slug = e.features?.[0]?.properties?.slug as string | undefined;
        if (!slug) return;
        zoomTo(slug);
        document.getElementById(`wm-${slug}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      };
      map.on("click", "starts", pick);
      map.on("click", "routes-line", pick);
      for (const layer of ["starts", "routes-line", "clusters"]) {
        map.on("mouseenter", layer, () => map && (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", layer, () => map && (map.getCanvas().style.cursor = ""));
      }
      map.on("moveend", updateCenter);
      // follow the site theme, auto mode's system setting included (src/lib/map-theme.ts)
      stopTheme = watchTheme((next) => {
        theme = next;
        map?.setStyle(STYLES[theme], { diff: false });
      });
    })().catch((error) => {
      console.error("World map failed:", error);
      failed = true;
    });
    return () => {
      document.removeEventListener("pointerdown", closeBar);
      document.removeEventListener("keydown", closeBar);
      cancelled = true;
      stopTheme();
      map?.remove();
    };
  });
</script>

<div class="wm">
  <div class="wm-mapwrap" style={`--bar-h: ${barH}px`} bind:this={mapWrap}>
    <div class="wm-map" bind:this={container} role="region" aria-label="World map of the trails"></div>
    {#if failed}<p class="wm-failed">The map couldn't be loaded. The list beside it still works.</p>{/if}
    <!-- one button per planning question along the map's top; each opens its filters -->
      <div class="wm-bar wm-over" role="toolbar" aria-label="Filters" bind:clientHeight={barH}>
        {#each BAR as b}
          {@const value = b.on(filters)}
          <div class="wm-bar-item">
            <button type="button" class="wm-pill" class:set={value} aria-expanded={barOpen === b.id} onclick={() => (barOpen = barOpen === b.id ? null : b.id)}>
              <span class="wm-pill-text">{b.label}{#if value}<span class="wm-pill-value">: {value}</span>{/if}</span>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
            </button>
            {#if barOpen === b.id}
              <div class="wm-drop">
                <FilterPanel trails={trails} bind:filters groups={[...b.groups]} idPrefix={`b-${b.id}-`} />
                <button type="button" class="wm-show" onclick={() => (barOpen = null)}>Show {matching.length} {matching.length === 1 ? "trail" : "trails"}</button>
              </div>
            {/if}
          </div>
        {/each}
    </div>
    {#if picked}
      {#key picked.slug}<TrailPreview trail={picked} onclose={closePreview} />{/key}
    {/if}
  </div>
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
    <!-- how many trails the filters leave, and the way to the list view with the same filters -->
    <div class="wm-status">
      <p role="status">
        {#if chips.length}<strong>{matching.length}</strong> of {trails.length} trails{:else}<strong>{trails.length}</strong> trails{/if}
        <a href={listHref}>List view <span aria-hidden="true">→</span></a>
      </p>
    </div>
    {#if chips.length}
      <ul class="wm-chips">
        {#each chips as c}
          <li><button type="button" onclick={c.clear} aria-label={`Remove filter: ${c.label}`}>{c.label}<span aria-hidden="true">×</span></button></li>
        {/each}
        <li><button type="button" class="wm-link" onclick={() => (filters = noFilters())}>Clear all</button></li>
      </ul>
    {/if}
    <ol class="wm-list" aria-label={here ? "Trails, nearest to you first" : "Trails, nearest to the map's centre first"}>
      {#each sorted as { t, d } (t.slug)}
        <li id={`wm-${t.slug}`} class:on={hovered === t.slug} class:picked={selected === t.slug} onmouseenter={() => (hovered = t.slug)} onmouseleave={() => (hovered = null)}>
          <!-- two actions: the entry zooms the map to the route, the arrow opens the trail page -->
          <button type="button" class="wm-entry" title="Show on map" aria-pressed={selected === t.slug} onclick={() => zoomTo(t.slug)}>
            <span class="wm-place">{t.countries.join(", ")}{#if here}<span class="wm-dist">{" · "}{fromYou(d)}</span>{/if}</span>
            <strong class="wm-name">{t.name}</strong>
            <span class="wm-fig">{figures(t)}</span>
            <span class="sr-only">, show on the map</span>
          </button>
          <a class="wm-open" href={`/trails/${t.slug}/`} title="Open the trail page" aria-label={`Open the ${t.name} page`}>
            {@html openIcon}
          </a>
        </li>
      {:else}
        <li class="wm-none">
          {#if !matching.length}
            No trail matches these filters.
            <button type="button" class="wm-link" onclick={() => (filters = noFilters())}>Clear the filters</button>
          {:else}
            No trail matches "{query}".
            <button type="button" class="wm-link" onclick={() => (query = "")}>Clear the search</button>
          {/if}
        </li>
      {/each}
    </ol>
  </aside>
</div>

<style>
  /* the window between header and footer (the page passes `full` to Base: no width cap, no page
     scrolling): the map filling the space, the list column on the right, scrolling on its own;
     phones: the map, then the list */
  .wm {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(320px, 400px);
    height: 100%;
  }
  /* the map and, over it, the picked trail's preview card */
  .wm-mapwrap {
    position: relative;
    min-height: 0;
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
    position: relative; /* keeps the entries' screen-reader words inside the scrolling list */
    border-bottom: 1px solid var(--line);
  }
  .wm-list li:not(.wm-none) {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
  }
  .wm-list li.on {
    background: var(--surface);
  }
  /* the picked trail: an accent bar on the left, its name in the accent colour */
  .wm-list li.picked {
    background: var(--surface);
    box-shadow: inset 4px 0 0 var(--accent);
  }
  .wm-list li.picked .wm-entry {
    padding-left: 14px;
  }
  .wm-list li.picked .wm-name {
    color: var(--accent);
  }
  /* the entry itself zooms the map to the trail */
  .wm-entry {
    display: grid;
    gap: 2px;
    width: 100%;
    padding: 12px 6px;
    border: 0;
    background: none;
    color: var(--text);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .wm-entry:hover .wm-name,
  .wm-entry:focus-visible .wm-name {
    color: var(--accent);
  }
  .wm-entry:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
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
  /* "Open the trail page": a round arrow, 40 px to tap */
  .wm-open {
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
  .wm-open:hover,
  .wm-open:focus-visible {
    border-color: var(--accent);
    color: var(--accent);
  }
  .wm-open :global(svg) {
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

  /* the filters' count, link and button under the search */
  .wm-status {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .wm-status p {
    margin: 0;
    color: var(--muted);
    font-size: 0.85rem;
  }
  .wm-status strong {
    color: var(--text);
  }
  .wm-status a {
    margin-left: 10px;
    color: var(--accent);
  }
  /* the active filters as removable chips, as on the search page */
  .wm-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .wm-chips button:not(.wm-link) {
    display: inline-flex;
    gap: 6px;
    padding: 3px 10px;
    border: 1px solid var(--accent);
    border-radius: 999px;
    background: var(--accent-soft);
    color: var(--text);
    font: 500 0.78rem var(--sans);
    cursor: pointer;
  }
  .wm-chips .wm-link {
    font-size: 0.78rem;
  }
  .wm-show {
    padding: 9px 18px;
    border: 0;
    border-radius: 999px;
    background: var(--accent);
    color: var(--bg);
    font: 600 0.9rem var(--sans);
    cursor: pointer;
  }
  .wm-failed {
    position: absolute;
    inset: 50% 16px auto;
    margin: 0;
    color: var(--muted);
    text-align: center;
  }
  /* the filter buttons along the map's top, left of the map's own buttons; the preview card
     moves below them */
  .wm-bar {
    position: absolute;
    z-index: 6;
    top: 12px;
    left: 56px;
    right: 56px;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 6px;
    pointer-events: none;
  }
  .wm-bar-item {
    position: relative;
    pointer-events: auto;
  }
  .wm-pill {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    max-width: 260px;
    padding: 7px 10px 7px 14px;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--bg);
    color: var(--text);
    font: 600 0.85rem var(--sans);
    white-space: nowrap;
    box-shadow: 0 2px 8px rgb(0 0 0 / 0.12);
    cursor: pointer;
  }
  .wm-pill.set {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .wm-pill-text {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .wm-pill-value {
    font-weight: 500;
  }
  .wm-pill svg {
    flex: none;
    width: 16px;
    height: 16px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
  }
  .wm-pill[aria-expanded="true"] svg {
    transform: rotate(180deg);
  }
  .wm-drop {
    position: absolute;
    z-index: 2;
    top: calc(100% + 6px);
    left: 0;
    display: grid;
    gap: 12px;
    width: 320px;
    max-width: calc(100vw - 24px);
    max-height: 60vh;
    overflow-y: auto;
    padding: 16px;
    border: 1px solid var(--line);
    border-radius: 14px;
    background: var(--bg);
    box-shadow: 0 10px 30px rgb(0 0 0 / 0.16);
  }
  /* the right-hand buttons open their panel leftwards, so it stays over the map */
  .wm-bar-item:nth-last-child(-n + 3) .wm-drop {
    left: auto;
    right: 0;
  }
  .wm-drop .wm-show {
    justify-self: end;
  }
  .wm-mapwrap :global(.tp) {
    top: calc(var(--bar-h) + 20px);
  }

  @media (max-width: 899px) {
    .wm-bar {
      left: 12px;
    }
    .wm {
      grid-template-columns: 1fr;
      grid-template-rows: 45% minmax(0, 1fr);
    }
    .wm-side {
      border-left: 0;
      border-top: 1px solid var(--line);
    }
  }
</style>
