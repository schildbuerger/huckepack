<script lang="ts">
  // Trail map: OpenStreetMap basemap (OpenFreeMap, no key) with hill shading and contour lines
  // (AWS Terrain Tiles, no key) and the trail's line from public/routes/<slug>.geojson. Main
  // stages are solid; approaches and variants dashed. The basemap follows the site theme
  // (Liberty light, Dark dark), also when the header switch changes it; route and termini take
  // their colours from the theme tokens.
  import { onMount } from "svelte";
  import "maplibre-gl/dist/maplibre-gl.css";
  // MapLibre looks for its worker next to its own script, which isn't there once Vite
  // bundles it; hand it the worker's URL instead (the worker file is self-contained).
  import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";

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
  }: { routeUrl: string | null; start: Point; end: Point; routeAttribution: string | null } = $props();

  const STYLES = {
    light: "https://tiles.openfreemap.org/styles/liberty",
    dark: "https://tiles.openfreemap.org/styles/dark",
  };
  // terrain: Terrarium-encoded elevation tiles (open data on AWS, mostly SRTM at our latitudes);
  // z12 is about 30 m per pixel, enough for shading and contours, and overzoomed beyond
  const TERRAIN = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
  const TERRAIN_ATTRIBUTION =
    '<a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md">Terrain: Mapzen, AWS Open Data</a>';
  // contour spacing per zoom, [minor, major] in metres; major lines are labelled
  const CONTOURS = { 10: [200, 1000], 11: [100, 500], 12: [50, 250], 13: [20, 100], 15: [10, 50] };
  // terrain colours per theme: warm browns on Liberty, light ink on Dark, kept faint so the route leads
  const TERRAIN_PAINT = {
    light: { shadow: "#5c4a38", highlight: "#ffffff", accent: "#7a6650", exaggeration: 0.3, contour: "#8a6a4a", minor: 0.3, major: 0.55 },
    dark: { shadow: "#000000", highlight: "rgba(255,255,255,0.1)", accent: "#000000", exaggeration: 0.4, contour: "#cbb69c", minor: 0.16, major: 0.32 },
  };

  type Theme = keyof typeof STYLES;
  const currentTheme = (): Theme => {
    const chosen = document.documentElement.dataset.theme;
    if (chosen === "light" || chosen === "dark") return chosen;
    return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  };
  const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  let container: HTMLDivElement;
  let failed = $state(false);

  onMount(() => {
    let map: import("maplibre-gl").Map | undefined;
    let cancelled = false;
    let stopWatchingTheme = () => {};

    (async () => {
      const [maplibre, { default: contour }] = await Promise.all([import("maplibre-gl"), import("maplibre-contour")]);
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
            filter: ["!=", ["get", "kind"], "main"],
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

      // follow the site theme: the header switch sets <html data-theme>, auto follows the system
      const onThemeChange = () => {
        const next = currentTheme();
        if (!map || next === theme) return;
        theme = next;
        map.setStyle(STYLES[theme], { diff: false });
      };
      const observer = new MutationObserver(onThemeChange);
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
      const system = matchMedia("(prefers-color-scheme: dark)");
      system.addEventListener("change", onThemeChange);
      stopWatchingTheme = () => {
        observer.disconnect();
        system.removeEventListener("change", onThemeChange);
      };
    })().catch((error) => {
      console.error("Trail map failed to load:", error);
      failed = true;
    });

    return () => {
      cancelled = true;
      stopWatchingTheme();
      map?.remove();
    };
  });
</script>

<div class="map" bind:this={container} role="region" aria-label="Map of the trail">
  {#if failed}<p class="failed">The map couldn't be loaded.</p>{/if}
</div>
<ul class="legend">
  <li><span class="key main"></span> Trail</li>
  <li><span class="key other"></span> Approach or variant</li>
  <li><span class="key dot start"></span> {start.name}</li>
  <li><span class="key dot end"></span> {end.name}</li>
  <li><span class="key contour"></span> Contour lines</li>
</ul>

<style>
  .map {
    width: 100%;
    aspect-ratio: 16 / 10;
    min-height: 300px;
    border: 1px solid var(--line);
    border-radius: 6px;
    overflow: hidden;
    background: var(--line);
  }
  .failed {
    margin: 0;
    padding: 16px;
    color: var(--muted);
  }
  @media (min-width: 700px) {
    .map {
      aspect-ratio: 11 / 5;
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
