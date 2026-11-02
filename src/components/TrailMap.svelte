<script lang="ts">
  // Trail map: OpenStreetMap basemap (OpenFreeMap, no key) with hill shading and contour lines
  // (AWS Terrain Tiles, no key) and the trail's line from public/routes/<slug>.geojson. Main
  // stages are solid; approaches and variants dashed; a closed stage's detour (kind "detour") dotted
  // on foot and as a railway line (ink with ties) by train or bus. The basemap follows the site theme
  // (Liberty light, Dark dark), also when the theme changes (the sun or moon, issue #155); route and termini take
  // their colours from the theme tokens.
  import { onMount } from "svelte";
  // MapLibre looks for its worker next to its own script, which isn't there once Vite
  // bundles it; hand it the worker's URL instead (the worker file is self-contained).
  import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
  import maplibreCssUrl from "maplibre-gl/dist/maplibre-gl.css?url";
  import { STYLES, currentTheme, token, watchTheme, loadMaplibreCss } from "../lib/map-theme";
  // icons for the layer switches (lucide-static, ISC licence)
  import iconDroplet from "lucide-static/icons/droplet.svg?raw";
  import iconDroplets from "lucide-static/icons/droplets.svg?raw";
  import iconBasket from "lucide-static/icons/shopping-basket.svg?raw";
  import iconBed from "lucide-static/icons/bed-double.svg?raw";
  import iconLayers from "lucide-static/icons/layers.svg?raw";

  interface Point {
    name: string;
    lat: number;
    lon: number;
  }

  let {
    routeUrl,
    start,
    end,
    routeAttribution,
    detours = [],
    transfers = [],
    stages = 0,
    others = [],
    placesUrl = null,
    placeCounts = {},
    children,
    fill = false,
  }: {
    routeUrl: string | null;
    start: Point;
    end: Point;
    routeAttribution: string | null;
    detours?: ("foot" | "train" | "bus")[]; // how the route's detours go, for the legend
    transfers?: ("boat" | "bus" | "train")[]; // the legs that aren't walked (stages.transfers), for the legend
    stages?: number; // the number of main stages, for the legend's stage keys
    others?: ("approach" | "variant")[]; // the other kinds of stage on the map, so the legend lists only those
    placesUrl?: string | null; // the trail's places (src/pages/places/[slug].json.ts), loaded when a layer is switched on
    placeCounts?: Partial<Record<PlaceGroup, number>>; // how many of each, for the layer switches
    // the route drawn at build time (src/lib/route-preview.ts), passed in as static markup (not a prop,
    // which the page would carry a second time as data), shown until the map has drawn
    children?: import("svelte").Snippet;
    fill?: boolean; // fill the height its parent gives (a flex column) instead of a fixed aspect ratio
  } = $props();

  // terrain: Terrarium-encoded elevation tiles (open data on AWS, mostly SRTM at our latitudes);
  // z12 is about 30 m per pixel, enough for shading and contours, and overzoomed beyond
  const TERRAIN = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
  const TERRAIN_ATTRIBUTION =
    '<a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md" target="_blank" rel="noopener noreferrer">Terrain: Mapzen, AWS Open Data</a>';
  // contour spacing per zoom, [minor, major] in metres; major lines are labelled
  const CONTOURS = { 10: [200, 1000], 11: [100, 500], 12: [50, 250], 13: [20, 100], 15: [10, 50] };
  // terrain colours per theme: warm browns on Liberty, light ink on Dark, kept faint so the route leads
  const TERRAIN_PAINT = {
    light: { shadow: "#5c4a38", highlight: "#ffffff", accent: "#7a6650", exaggeration: 0.3, contour: "#8a6a4a", minor: 0.3, major: 0.55 },
    dark: { shadow: "#000000", highlight: "rgba(255,255,255,0.1)", accent: "#000000", exaggeration: 0.4, contour: "#cbb69c", minor: 0.16, major: 0.32 },
  };


  let container: HTMLDivElement;
  let failed = $state(false);
  // full view and reset view (issue #152; of three previews, approach C): "Expand" grows the map over
  // the whole window inside the page (the browser's full screen isn't there for maps on iPhones),
  // "Close" or Esc returns; "Reset view" brings back the first framing once the visitor has moved it
  let moved = $state(false); // the visitor has panned or zoomed since the first framing
  let expanded = $state(false); // the map fills the window inside the page
  let resetView = () => {};
  let fitAfterResize = () => {};
  // the optional layers (issue #103): drinking water, springs, shops and places to sleep, as in the
  // Water & Supply and Sleeping charts; switched on under the legend, loaded only then; a click shows the
  // place with its link (its OSM object, or a record's own source)
  type PlaceGroup = "drinking" | "springs" | "shops" | "beds";
  const PLACE_GROUPS: { id: PlaceGroup; label: string; short: string; icon: string }[] = [
    { id: "drinking", label: "Drinking water", short: "Water", icon: iconDroplet },
    { id: "springs", label: "Springs", short: "Springs", icon: iconDroplets },
    { id: "shops", label: "Shops", short: "Shops", icon: iconBasket },
    { id: "beds", label: "Places to sleep", short: "Beds", icon: iconBed },
  ];
  // the switches (issue #103; of three previews, approach A with C's icons): a Layers button under the
  // zoom buttons opens a small panel inside the map, each layer with its icon in its colour and its count
  let layersOpen = $state(false);
  const groups = $derived(PLACE_GROUPS.filter((g) => placeCounts[g.id]));
  let shown = $state<Record<PlaceGroup, boolean>>({ drinking: false, springs: false, shops: false, beds: false });
  let places: Record<PlaceGroup, [number, number, string, string, string][]> | null = null;
  let mapRef: any;
  let maplibreRef: any;
  const handled = new Set<string>(); // layers whose pointer and click handlers are set (they outlive a style)
  const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  function addPlaceLayers() {
    const map = mapRef;
    if (!map || !places || !map.isStyleLoaded?.()) return;
    const water = token("--water");
    const paper = token("--bg");
    const paint: Record<PlaceGroup, object> = {
      drinking: { "circle-radius": 5, "circle-color": water, "circle-stroke-color": paper, "circle-stroke-width": 1.5 },
      springs: { "circle-radius": 4, "circle-color": paper, "circle-stroke-color": water, "circle-stroke-width": 2 },
      shops: { "circle-radius": 5, "circle-color": token("--accent"), "circle-stroke-color": paper, "circle-stroke-width": 1.5 },
      beds: { "circle-radius": 5, "circle-color": token("--clim-high"), "circle-stroke-color": paper, "circle-stroke-width": 1.5 },
    };
    for (const { id } of PLACE_GROUPS) {
      const layer = `places-${id}`;
      if (!map.getSource(layer)) {
        map.addSource(layer, {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: places[id].map(([lon, lat, what, name, link]) => ({ type: "Feature", properties: { what, name, link }, geometry: { type: "Point", coordinates: [lon, lat] } })),
          },
        });
        // above the trail line, below the stage stops and the finish
        map.addLayer({ id: layer, type: "circle", source: layer, paint: paint[id] }, map.getLayer("stage-stops") ? "stage-stops" : undefined);
      }
      if (!handled.has(layer)) {
        handled.add(layer);
        map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
        map.on("click", layer, (e: any) => {
          const p = e.features[0].properties;
          const link = p.link ? `<br><a href="${esc(p.link)}" target="_blank" rel="noopener noreferrer">${p.link.includes("openstreetmap.org") ? "View on OpenStreetMap" : "View its source"} ↗</a>` : "";
          new maplibreRef.Popup({ offset: 8, maxWidth: "240px" })
            .setLngLat(e.features[0].geometry.coordinates)
            .setHTML(`<strong>${esc(p.name || p.what)}</strong>${p.name ? `<br>${esc(p.what)}` : ""}${link}`)
            .addTo(map);
        });
      }
      map.setLayoutProperty(layer, "visibility", shown[id] ? "visible" : "none");
    }
  }
  async function togglePlaces(id: PlaceGroup) {
    shown[id] = !shown[id];
    if (!places && placesUrl) places = await fetch(placesUrl).then((r) => r.json());
    addPlaceLayers();
  }

  // the finish's marker for the legend, as the map draws it: a dark disc with a small white flag
  const FLAG =
    '<svg viewBox="0 0 24 24" width="20" height="20"><circle cx="12" cy="12" r="11" fill="var(--text)"/><rect x="8" y="6" width="1.8" height="12" fill="var(--bg)"/><path d="M9.8 6 17 8.5 9.8 11Z" fill="var(--bg)"/></svg>';
  // lucide icons (ISC licence), drawn in the button's text colour
  const svg = (d: string) => `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const ICON = {
    reset: svg('<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>'),
    max: svg('<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>'),
    close: svg('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
  };
  // the map over the whole window inside the page; Esc closes it
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && expanded) toggleExpanded();
  };
  function toggleExpanded() {
    expanded = !expanded;
    document.documentElement.classList.toggle("map-expanded", expanded);
    if (expanded) window.addEventListener("keydown", onKey);
    else window.removeEventListener("keydown", onKey);
    setTimeout(fitAfterResize, 30);
  }
  let showPreview = $state(true);

  onMount(() => {
    let map: import("maplibre-gl").Map | undefined;
    let cancelled = false;
    let stopWatchingTheme = () => {};

    // the map (MapLibre, its stylesheet, the terrain worker: the costliest part of the page) starts on
    // the visitor's first scroll, pointer move, tap or key press anywhere on the page, not on load;
    // the route preview holds its place until then (PageSpeed, issue #86)
    const STARTERS = ["scroll", "wheel", "pointermove", "pointerdown", "touchstart", "keydown"] as const;
    const stopListening = () => {
      for (const type of STARTERS) window.removeEventListener(type, go);
    };
    const go = () => {
      stopListening();
      startMap();
    };
    for (const type of STARTERS) window.addEventListener(type, go, { passive: true });

    const startMap = () => (async () => {
      // MapLibre's stylesheet comes with its script, not in the page's head (src/lib/map-theme.ts)
      const [maplibre, { default: contour }] = await Promise.all([import("maplibre-gl"), import("maplibre-contour"), loadMaplibreCss(maplibreCssUrl)]);
      maplibre.setWorkerUrl(workerUrl);
      maplibreRef = maplibre;
      // one DEM source feeds both the hill shading and the contour lines (decoded in its own worker)
      const dem = new contour.DemSource({ url: TERRAIN, encoding: "terrarium", maxzoom: 12, worker: true });
      dem.setupMaplibre(maplibre);
      const route = routeUrl
        ? await fetch(routeUrl).then((r) => {
            if (!r.ok) throw new Error(`route ${routeUrl}: HTTP ${r.status}`);
            return r.json();
          })
        : null;
      if (cancelled) return;

      const lons = [start.lon, end.lon];
      const lats = [start.lat, end.lat];
      for (const f of route?.features ?? []) {
        for (const [lon, lat] of f.geometry.coordinates) {
          lons.push(lon);
          lats.push(lat);
        }
      }

      let theme = currentTheme();
      map = new maplibre.Map({
        container,
        style: STYLES[theme],
        bounds: [
          [Math.min(...lons), Math.min(...lats)],
          [Math.max(...lons), Math.max(...lats)],
        ],
        fitBoundsOptions: { padding: 32 },
        cooperativeGestures: true,
        // the sources behind the (i), compact everywhere and closed until the visitor opens it
        attributionControl: { compact: true, ...(routeAttribution ? { customAttribution: `Route: ${routeAttribution}` } : {}) },
      });
      // MapLibre shows the compact attribution's text until the first drag; fold it from the start, as
      // its own first drag does (MapLibre 6: the class goes, `open` stays), and again on every style,
      // since a theme switch redraws it
      const closeAttribution = () => container.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
      map.on("styledata", closeAttribution);
      map.once("load", closeAttribution);
      map.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");
      map.addControl(new maplibre.ScaleControl({ unit: "metric" }), "bottom-left");
      mapRef = map;

      // the first framing, to return to; a pan or zoom by the visitor (not ours) marks the map moved
      const first: [[number, number], [number, number]] = [
        [Math.min(...lons), Math.min(...lats)],
        [Math.max(...lons), Math.max(...lats)],
      ];
      resetView = () => {
        map?.fitBounds(first, { padding: 32 });
        moved = false;
      };
      map.on("moveend", (e: any) => {
        if (e.originalEvent) moved = true;
      });
      // expanded, the wheel zooms without Ctrl or Cmd; in the page it scrolls the page
      fitAfterResize = () => {
        map?.resize();
        if (expanded) map?.cooperativeGestures.disable();
        else map?.cooperativeGestures.enable();
        if (!moved) map?.fitBounds(first, { padding: 32, animate: false });
      };
      // the preview gives way once the map has drawn, framed the same, so the route stays put
      map.once("load", () => (showPreview = false));

      // runs on the first style and again after every theme switch, since a new style drops our layers
      map.on("style.load", () => {
        if (!map) return;
        const accent = token("--accent");
        const ink = token("--text");
        const paper = token("--bg");
        const waterBlue = token("--water");
        const paint = TERRAIN_PAINT[theme];

        // terrain goes under water, roads, buildings and labels, so they stay on top
        const below = map
          .getStyle()
          .layers.find((l) => "source-layer" in l && ["water", "waterway", "transportation", "building"].includes(l["source-layer"] ?? ""))?.id;
        map.addSource("dem", { type: "raster-dem", tiles: [dem.sharedDemProtocolUrl], encoding: "terrarium", tileSize: 256, maxzoom: 12, attribution: TERRAIN_ATTRIBUTION });
        map.addLayer(
          {
            id: "hillshade",
            type: "hillshade",
            source: "dem",
            paint: {
              "hillshade-shadow-color": paint.shadow,
              "hillshade-highlight-color": paint.highlight,
              "hillshade-accent-color": paint.accent,
              "hillshade-exaggeration": paint.exaggeration,
            },
          },
          below,
        );
        map.addSource("contours", {
          type: "vector",
          tiles: [dem.contourProtocolUrl({ thresholds: CONTOURS, elevationKey: "ele", levelKey: "level", contourLayer: "contours" })],
          maxzoom: 15,
        });
        map.addLayer(
          {
            id: "contours",
            type: "line",
            source: "contours",
            "source-layer": "contours",
            paint: {
              "line-color": paint.contour,
              "line-opacity": ["case", [">", ["get", "level"], 0], paint.major, paint.minor],
              "line-width": ["case", [">", ["get", "level"], 0], 1, 0.6],
            },
          },
          below,
        );
        map.addLayer({
          id: "contour-labels",
          type: "symbol",
          source: "contours",
          "source-layer": "contours",
          filter: [">", ["get", "level"], 0],
          minzoom: 12,
          layout: {
            "symbol-placement": "line",
            "text-field": ["concat", ["number-format", ["get", "ele"], {}], " m"],
            "text-font": ["Noto Sans Regular"],
            "text-size": 10,
          },
          paint: { "text-color": paint.contour, "text-halo-color": paper, "text-halo-width": 1.5 },
        });

        if (route) {
          map.addSource("route", { type: "geojson", data: route });
          map.addLayer({
            id: "route-casing",
            type: "line",
            source: "route",
            layout: { "line-join": "round", "line-cap": "round" },
            paint: { "line-color": paper, "line-width": 7, "line-opacity": 0.9 },
          });
          map.addLayer({
            id: "route-other",
            type: "line",
            source: "route",
            filter: ["in", ["get", "kind"], ["literal", ["approach", "variant"]]],
            layout: { "line-join": "round" },
            paint: { "line-color": accent, "line-width": 3, "line-dasharray": [2, 2], "line-opacity": 0.7 },
          });
          map.addLayer({
            id: "route-main",
            type: "line",
            source: "route",
            filter: ["==", ["get", "kind"], "main"],
            layout: { "line-join": "round", "line-cap": "round" },
            paint: { "line-color": accent, "line-width": 4 },
          });
          // a closed stage's detour: on foot a dotted line in the trail's colour, by train or bus
          // a thin ink line with ties across, like a railway on a printed map
          map.addLayer({
            id: "detour-foot",
            type: "line",
            source: "route",
            filter: ["all", ["==", ["get", "kind"], "detour"], ["==", ["get", "by"], "foot"]],
            layout: { "line-join": "round", "line-cap": "round" },
            paint: { "line-color": accent, "line-width": 4, "line-dasharray": [0, 2] },
          });
          map.addLayer({
            id: "detour-ride",
            type: "line",
            source: "route",
            filter: ["all", ["==", ["get", "kind"], "detour"], ["!=", ["get", "by"], "foot"]],
            layout: { "line-join": "round" },
            paint: { "line-color": ink, "line-width": 2 },
          });
          map.addLayer({
            id: "detour-ride-ties",
            type: "line",
            source: "route",
            filter: ["all", ["==", ["get", "kind"], "detour"], ["!=", ["get", "by"], "foot"]],
            paint: { "line-color": ink, "line-width": 7, "line-dasharray": [0.3, 2.2] },
          });
          // a leg that isn't walked (the W Trek's catamaran): by boat a short-dashed water-blue line
          // on a light casing, like a ferry on a printed map, so it reads apart from the variants'
          // dashes in the trail's colour
          map.addLayer({
            id: "transfer-casing",
            type: "line",
            source: "route",
            filter: ["==", ["get", "kind"], "transfer"],
            layout: { "line-join": "round", "line-cap": "round" },
            paint: { "line-color": paper, "line-width": 6, "line-opacity": 0.9 },
          });
          map.addLayer({
            id: "transfer",
            type: "line",
            source: "route",
            filter: ["==", ["get", "kind"], "transfer"],
            layout: { "line-join": "round" },
            paint: { "line-color": waterBlue, "line-width": 3, "line-dasharray": [1.2, 1.2] },
          });
        }
        // the start, the stages and the finish (issue #153; of three previews, approach A, after #151's
        // numbers midway and rings at the boundaries read as three kinds of circle): one kind of marker,
        // a numbered stop where each main stage starts, numbered as in the stages table (the first, the
        // trailhead, filled dark and larger), and a flag at the finish. Without a map line, the termini
        // as dots.
        const main = (route?.features ?? []).filter((f: any) => f.properties.kind === "main");
        if (main.length) {
          const pt = (coordinates: number[], properties: object) => ({ type: "Feature", properties, geometry: { type: "Point", coordinates } });
          const fc = (features: object[]) => ({ type: "FeatureCollection", features });
          // the finish: a dark disc with a small white flag, drawn on a canvas at twice the size
          const cv = document.createElement("canvas");
          cv.width = cv.height = 48;
          const g = cv.getContext("2d")!;
          g.scale(2, 2);
          g.fillStyle = ink;
          g.beginPath();
          g.arc(12, 12, 11, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = paper;
          g.fillRect(8, 6, 1.8, 12);
          g.beginPath();
          g.moveTo(9.8, 6);
          g.lineTo(17, 8.5);
          g.lineTo(9.8, 11);
          g.closePath();
          g.fill();
          if (map.hasImage("finish-flag")) map.removeImage("finish-flag");
          map.addImage("finish-flag", g.getImageData(0, 0, 48, 48), { pixelRatio: 2 });
          map.addSource("stage-stops", {
            type: "geojson",
            data: fc(main.map((f: any, i: number) => pt(f.geometry.coordinates[0], { number: f.properties.number, first: i === 0 }))),
          } as any);
          map.addSource("finish", { type: "geojson", data: fc([pt(main.at(-1).geometry.coordinates.at(-1), {})]) } as any);
          map.addLayer({
            id: "stage-stops",
            type: "circle",
            source: "stage-stops",
            paint: {
              "circle-radius": ["case", ["get", "first"], 11, 9],
              "circle-color": ["case", ["get", "first"], ink, paper],
              "circle-stroke-color": ink,
              "circle-stroke-width": 2,
            },
          });
          map.addLayer({
            id: "stage-stop-numbers",
            type: "symbol",
            source: "stage-stops",
            layout: { "text-field": ["get", "number"], "text-font": ["Noto Sans Regular"], "text-size": 11, "text-allow-overlap": true, "text-ignore-placement": true },
            paint: { "text-color": ["case", ["get", "first"], paper, ink] },
          });
          map.addLayer({
            id: "finish",
            type: "symbol",
            source: "finish",
            layout: { "icon-image": "finish-flag", "icon-allow-overlap": true, "icon-ignore-placement": true },
          });
        } else {
          map.addSource("termini", {
            type: "geojson",
            data: {
              type: "FeatureCollection",
              features: [start, end].map((p, i) => ({
                type: "Feature",
                properties: { name: p.name, end: i === 1 },
                geometry: { type: "Point", coordinates: [p.lon, p.lat] },
              })),
            },
          });
          map.addLayer({
            id: "termini",
            type: "circle",
            source: "termini",
            paint: {
              "circle-radius": 7,
              "circle-color": ["case", ["get", "end"], ink, paper],
              "circle-stroke-color": ink,
              "circle-stroke-width": 2.5,
            },
          });
        }
        // the places switched on, again after a theme switch (a new style drops them)
        if (places) setTimeout(addPlaceLayers);
      });

      // follow the site theme (src/lib/map-theme.ts)
      stopWatchingTheme = watchTheme((next) => {
        theme = next;
        map?.setStyle(STYLES[theme], { diff: false });
      });
    })().catch((error) => {
      console.error("Trail map failed to load:", error);
      failed = true;
    });

    return () => {
      cancelled = true;
      stopListening();
      stopWatchingTheme();
      map?.remove();
    };
  });
</script>

<div class="map" class:fill class:expanded bind:this={container} role="region" aria-label="Map of the trail">
  {#if showPreview}{@render children?.()}{/if}
  {#if failed}<p class="failed">The map couldn't be loaded.</p>{/if}
  {#if !showPreview && !failed}
    <div class="map-btns tl">
      <button type="button" class="map-btn" aria-pressed={expanded} onclick={toggleExpanded}>
        {@html expanded ? ICON.close : ICON.max} {expanded ? "Close" : "Expand"}
      </button>
      {#if moved}<button type="button" class="map-btn" onclick={() => resetView()}>{@html ICON.reset} Reset view</button>{/if}
    </div>
  {/if}
  {#if !showPreview && !failed && placesUrl && groups.length}
      <div
        class="lay-a"
        role="presentation"
        onkeydown={(e) => {
          if (e.key === "Escape" && layersOpen) {
            layersOpen = false;
            (e.currentTarget as HTMLElement).querySelector("button")?.focus();
          }
        }}
      >
        <button type="button" class="lay-btn" aria-expanded={layersOpen} aria-controls="lay-panel" title="Layers" onclick={() => (layersOpen = !layersOpen)}>
          {@html iconLayers}<span class="sr-only">Layers</span>
        </button>
        {#if layersOpen}
          <div class="lay-panel" id="lay-panel" role="group" aria-label="Show on the map">
            <p class="lay-title">Show on the map</p>
            {#each groups as g (g.id)}
              <label class="lay-row">
                <input type="checkbox" checked={shown[g.id]} onchange={() => togglePlaces(g.id)} />
                <span class="lay-icon {g.id}" aria-hidden="true">{@html g.icon}</span>
                <span class="lay-name">{g.label}</span>
                <span class="count">{placeCounts[g.id]}</span>
              </label>
            {/each}
          </div>
        {/if}
      </div>
  {/if}
</div>
<ul class="legend">
  <li><span class="key main"></span> Trail</li>
  <!-- only what this map shows (issue #153); the start's and finish's names are in the facts beside it -->
  {#if others.length}<li><span class="key other"></span> {others.includes("approach") ? (others.includes("variant") ? "Approach or variant" : "Approach") : "Variant"}</li>{/if}
  {#if detours.includes("foot")}<li><span class="key foot"></span> Detour on foot</li>{/if}
  {#if detours.some((d) => d !== "foot")}<li><span class="key ride"></span> Detour by {detours.includes("bus") ? (detours.includes("train") ? "train or bus" : "bus") : "train"}</li>{/if}

  {#if transfers.length}<li><span class="key transfer"></span> By {transfers.join(" or ")}</li>{/if}
  {#if routeUrl && stages > 0}
    <!-- the map's markers (issue #153): the start as stop 1, the other stage starts, the finish's flag -->
    <li><span class="key stop first" aria-hidden="true">1</span> Start</li>
    {#if stages > 1}<li><span class="key stop" aria-hidden="true">2</span> Stage start</li>{/if}
    <li><span class="key flag" aria-hidden="true">{@html FLAG}</span> Finish</li>
  {:else}
    <li><span class="key dot start"></span> {start.name}</li>
    <li><span class="key dot end"></span> {end.name}</li>
  {/if}
  {#each groups.filter((g) => shown[g.id]) as g (g.id)}<li><span class="key place {g.id}"></span> {g.label}</li>{/each}
  <li><span class="key contour"></span> Contour lines</li>
</ul>

<style>
  /* the map's own buttons (issue #152): Expand or Close, and Reset view once moved; expanded, the
     map covers the window inside the page */
  .map-btns {
    position: absolute;
    z-index: 3;
    display: flex;
    gap: 8px;
  }
  .map-btns.tl {
    top: 10px;
    left: 10px;
  }
  .map-btn {
    display: inline-flex;
    gap: 6px;
    align-items: center;
    min-height: 32px;
    padding: 4px 12px;
    border: 1px solid var(--line);
    border-radius: 16px;
    background: var(--bg);
    color: var(--text);
    font: inherit;
    font-size: 0.85rem;
    cursor: pointer;
  }
  .map-btn:hover {
    background: var(--surface);
  }
  .map-btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .map.expanded {
    position: fixed;
    inset: 0;
    z-index: 1000;
    width: auto;
    height: auto;
    aspect-ratio: auto;
    border: 0;
    border-radius: 0;
  }
  :global(html.map-expanded) {
    overflow: hidden;
  }
  .map {
    position: relative;
    width: 100%;
    aspect-ratio: 16 / 10;
    min-height: 300px;
    border: 1px solid var(--line);
    border-radius: 6px;
    overflow: hidden;
    background: var(--line);
  }
  /* the route preview (src/lib/route-preview.ts) until the map starts: over the map's box, which
     clips what it draws past the route's frame */
  .map :global(.route-preview) {
    position: absolute;
    inset: 0;
    z-index: 1;
    width: 100%;
    height: 100%;
    background: var(--surface);
  }
  .map :global(.route-preview .rp-casing) {
    fill: none;
    stroke: var(--bg);
    stroke-width: 7;
    stroke-linejoin: round;
    stroke-linecap: round;
    vector-effect: non-scaling-stroke;
  }
  .map :global(.route-preview .rp-main) {
    fill: none;
    stroke: var(--accent);
    stroke-width: 4;
    stroke-linejoin: round;
    stroke-linecap: round;
    vector-effect: non-scaling-stroke;
  }
  .map :global(.route-preview .rp-other) {
    fill: none;
    stroke: var(--accent);
    stroke-width: 3;
    stroke-dasharray: 6 6;
    opacity: 0.7;
    vector-effect: non-scaling-stroke;
  }
  .map :global(.route-preview .rp-transfer) {
    fill: none;
    stroke: var(--water);
    stroke-width: 3;
    stroke-dasharray: 3 3;
    vector-effect: non-scaling-stroke;
  }
  .map :global(.route-preview .rp-start),
  .map :global(.route-preview .rp-end) {
    stroke: var(--text);
    stroke-width: 2.5;
    vector-effect: non-scaling-stroke;
  }
  /* as the map's markers (issue #153): the start dark like stop 1, the finish dark with its flag */
  .map :global(.route-preview .rp-start) {
    fill: var(--text);
  }
  .map :global(.route-preview .rp-flag) {
    fill: var(--bg);
  }
  .map :global(.route-preview .rp-end) {
    fill: var(--text);
  }
  .failed {
    position: relative;
    z-index: 2;
    margin: 0;
    padding: 16px;
    color: var(--muted);
  }
  @media (min-width: 700px) {
    .map {
      aspect-ratio: 11 / 5;
    }
  }
  /* beside the location facts (from 900 px): as tall as they are, at least 360 px */
  @media (min-width: 900px) {
    .map.fill {
      flex: 1;
      aspect-ratio: auto;
      min-height: 360px;
    }
  }
  /* the layer switches inside the map (issue #103): a button under the zoom buttons and its panel */
  .lay-a {
    position: absolute;
    top: 78px;
    right: 10px;
    z-index: 3;
  }
  .lay-btn {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: var(--bg);
    color: var(--text);
    box-shadow: 0 0 0 2px rgb(0 0 0 / 10%);
    cursor: pointer;
  }
  .lay-btn :global(svg) {
    width: 18px;
    height: 18px;
  }
  .lay-btn[aria-expanded="true"] {
    background: var(--surface);
  }
  .lay-panel {
    position: absolute;
    top: 0;
    right: 38px;
    display: grid;
    gap: 2px;
    min-width: 210px;
    padding: 8px 10px;
    border-radius: 6px;
    background: var(--bg);
    box-shadow: 0 0 0 2px rgb(0 0 0 / 10%);
    font-size: 0.85rem;
  }
  .lay-title {
    margin: 0 0 4px;
    font-weight: 600;
  }
  .lay-row {
    display: grid;
    grid-template-columns: auto auto 1fr auto;
    gap: 8px;
    align-items: center;
    min-height: 28px;
    cursor: pointer;
  }
  .lay-row input {
    margin: 0;
    accent-color: var(--accent);
  }
  /* each layer's icon in its colour on the map */
  .lay-icon {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: 4px;
    color: var(--bg);
  }
  .lay-icon :global(svg) {
    width: 16px;
    height: 16px;
  }
  .lay-icon.drinking,
  .lay-icon.springs {
    background: var(--water);
  }
  .lay-icon.shops {
    background: var(--accent);
  }
  .lay-icon.beds {
    background: var(--clim-high);
  }
  .lay-btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  .count {
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .key.place {
    width: 10px;
    height: 10px;
    border: 1.5px solid var(--bg);
    border-radius: 50%;
    box-shadow: 0 0 0 1px var(--line);
  }
  .key.place.drinking {
    background: var(--water);
  }
  .key.place.springs {
    border: 2px solid var(--water);
    background: var(--bg);
    box-shadow: none;
  }
  .key.place.shops {
    background: var(--accent);
  }
  .key.place.beds {
    background: var(--clim-high);
  }
  .map :global(.maplibregl-popup-content) {
    padding: 8px 10px;
    border-radius: 6px;
    background: var(--bg);
    color: var(--text);
    font: inherit;
    font-size: 0.85rem;
    line-height: 1.4;
  }
  .map :global(.maplibregl-popup-content a) {
    color: var(--accent-text);
  }
  .map :global(.maplibregl-popup-tip) {
    display: none;
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 16px;
    margin: 8px 0 0;
    padding: 0;
    list-style: none;
    font-size: 0.85em;
    color: var(--muted);
  }
  .key {
    display: inline-block;
    width: 24px;
    height: 0;
    vertical-align: middle;
    border-top: 4px solid var(--accent);
  }
  .key.other {
    border-top: 3px dashed var(--accent);
    opacity: 0.7;
  }
  .key.foot {
    border-top: 4px dotted var(--accent);
  }
  .key.ride {
    height: 8px;
    border-top: 0;
    background:
      linear-gradient(var(--text), var(--text)) center / 100% 2px no-repeat,
      repeating-linear-gradient(90deg, var(--text) 0 1.5px, transparent 1.5px 7px) center / 100% 8px no-repeat;
  }
  .key.stop {
    width: 18px;
    height: 18px;
    border: 2px solid var(--text);
    border-radius: 50%;
    background: var(--bg);
    color: var(--text);
    font-size: 10px;
    line-height: 14px;
    text-align: center;
  }
  .key.stop.first {
    width: 20px;
    height: 20px;
    background: var(--text);
    color: var(--bg);
    line-height: 16px;
  }
  .key.flag {
    width: 20px;
    height: 20px;
    border: 0;
  }
  .key.flag :global(svg) {
    display: block;
  }
  .key.transfer {
    height: 6px;
    border-top: 0;
    background: repeating-linear-gradient(90deg, var(--water) 0 4px, transparent 4px 8px) center / 100% 3px no-repeat;
  }
  .key.contour {
    border-top: 1px solid var(--muted);
  }
  .key.dot {
    width: 10px;
    height: 10px;
    border: 2.5px solid var(--text);
    border-radius: 50%;
  }
  .key.start {
    background: var(--bg);
  }
  .key.end {
    background: var(--text);
  }
</style>
