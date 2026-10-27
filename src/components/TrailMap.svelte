<script lang="ts">
  // Trail map: OpenStreetMap basemap (OpenFreeMap, no key) with the trail's line from
  // public/routes/<slug>.geojson. Main stages are solid; approaches and variants dashed.
  import { onMount } from "svelte";
  import "maplibre-gl/dist/maplibre-gl.css";

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

  const STYLE = "https://tiles.openfreemap.org/styles/liberty";
  const ROUTE = "#c2410c";

  let container: HTMLDivElement;

  onMount(() => {
    let map: import("maplibre-gl").Map | undefined;
    let cancelled = false;

    (async () => {
      const maplibre = await import("maplibre-gl");
      const route = routeUrl ? await fetch(routeUrl).then((r) => r.json()) : null;
      if (cancelled) return;

      const lons = [start.lon, end.lon];
      const lats = [start.lat, end.lat];
      for (const f of route?.features ?? []) {
        for (const [lon, lat] of f.geometry.coordinates) {
          lons.push(lon);
          lats.push(lat);
        }
      }

      map = new maplibre.Map({
        container,
        style: STYLE,
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

      map.on("load", () => {
        if (!map) return;
        if (route) {
          map.addSource("route", { type: "geojson", data: route });
          map.addLayer({
            id: "route-casing",
            type: "line",
            source: "route",
            layout: { "line-join": "round", "line-cap": "round" },
            paint: { "line-color": "#ffffff", "line-width": 7, "line-opacity": 0.9 },
          });
          map.addLayer({
            id: "route-other",
            type: "line",
            source: "route",
            filter: ["!=", ["get", "kind"], "main"],
            layout: { "line-join": "round" },
            paint: { "line-color": ROUTE, "line-width": 3, "line-dasharray": [2, 2], "line-opacity": 0.7 },
          });
          map.addLayer({
            id: "route-main",
            type: "line",
            source: "route",
            filter: ["==", ["get", "kind"], "main"],
            layout: { "line-join": "round", "line-cap": "round" },
            paint: { "line-color": ROUTE, "line-width": 4 },
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
            "circle-color": ["case", ["get", "end"], "#1f2421", "#ffffff"],
            "circle-stroke-color": "#1f2421",
            "circle-stroke-width": 2.5,
          },
        });
      });
    })();

    return () => {
      cancelled = true;
      map?.remove();
    };
  });
</script>

<div class="map" bind:this={container} role="region" aria-label="Map of the trail"></div>
<ul class="legend">
  <li><span class="key main"></span> Trail</li>
  <li><span class="key other"></span> Approach or variant</li>
  <li><span class="key dot start"></span> {start.name}</li>
  <li><span class="key dot end"></span> {end.name}</li>
</ul>

<style>
  .map {
    width: 100%;
    aspect-ratio: 16 / 10;
    min-height: 320px;
    border: 1px solid var(--line);
    border-radius: 6px;
    overflow: hidden;
    background: var(--line);
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
    border-top: 4px solid #c2410c;
  }
  .key.other {
    border-top: 3px dashed #c2410c;
    opacity: 0.7;
  }
  .key.dot {
    width: 10px;
    height: 10px;
    border: 2.5px solid #1f2421;
    border-radius: 50%;
  }
  .key.start {
    background: #ffffff;
  }
  .key.end {
    background: #1f2421;
  }
  @media (prefers-color-scheme: dark) {
    .key.dot {
      border-color: #e7e9e4;
    }
  }
</style>
