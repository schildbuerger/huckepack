<script lang="ts">
  // Trail map: OpenStreetMap basemap (OpenFreeMap, no key) with hill shading and contour lines
  // (AWS Terrain Tiles, no key) and the trail's line from public/routes/<slug>.geojson. Main
  // stages are solid; approaches and variants dashed; a closed stage's detour (kind "detour") dotted
  // on foot and as a railway line (ink with ties) by train or bus. The basemap follows the site theme
  // (Liberty light, Dark dark), also when the header switch changes it; route and termini take
  // their colours from the theme tokens.
  import { onMount } from "svelte";
  // MapLibre looks for its worker next to its own script, which isn't there once Vite
  // bundles it; hand it the worker's URL instead (the worker file is self-contained).
  import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
  import maplibreCssUrl from "maplibre-gl/dist/maplibre-gl.css?url";
  import { STYLES, currentTheme, token, watchTheme, loadMaplibreCss } from "../lib/map-theme";

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
    children,
    fill = false,
  }: {
    routeUrl: string | null;
    start: Point;
    end: Point;
    routeAttribution: string | null;
    detours?: ("foot" | "train" | "bus")[]; // how the route's detours go, for the legend
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
        attributionControl: routeAttribution ? { customAttribution: `Route: ${routeAttribution}` } : {},
      });
      map.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");
      map.addControl(new maplibre.ScaleControl({ unit: "metric" }), "bottom-left");
      // the preview gives way once the map has drawn, framed the same, so the route stays put
      map.once("load", () => (showPreview = false));

      // runs on the first style and again after every theme switch, since a new style drops our layers
      map.on("style.load", () => {
        if (!map) return;
        const accent = token("--accent");
        const ink = token("--text");
        const paper = token("--bg");
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
        }
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

<div class="map" class:fill bind:this={container} role="region" aria-label="Map of the trail">
  {#if showPreview}{@render children?.()}{/if}
  {#if failed}<p class="failed">The map couldn't be loaded.</p>{/if}
</div>
<ul class="legend">
  <li><span class="key main"></span> Trail</li>
  <li><span class="key other"></span> Approach or variant</li>
  {#if detours.includes("foot")}<li><span class="key foot"></span> Detour on foot</li>{/if}
  {#if detours.some((d) => d !== "foot")}<li><span class="key ride"></span> Detour by {detours.includes("bus") ? (detours.includes("train") ? "train or bus" : "bus") : "train"}</li>{/if}
  <li><span class="key dot start"></span> {start.name}</li>
  <li><span class="key dot end"></span> {end.name}</li>
  <li><span class="key contour"></span> Contour lines</li>
</ul>

<style>
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
  .map :global(.route-preview .rp-start),
  .map :global(.route-preview .rp-end) {
    stroke: var(--text);
    stroke-width: 2.5;
    vector-effect: non-scaling-stroke;
  }
  .map :global(.route-preview .rp-start) {
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
