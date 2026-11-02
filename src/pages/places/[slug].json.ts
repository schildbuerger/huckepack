// A trail's places for its map's optional layers (issue #103), /places/<slug>.json: drinking water and
// springs (pipeline/water.py, with a record's own waterPoints), shops and places to sleep
// (pipeline/along.py), each as [lon, lat, kind, name, osm] in compact form. The map loads it only when a
// visitor switches a layer on, so the trail page carries none of it.
import type { APIRoute } from "astro";
import { getCollection, getEntry } from "astro:content";

export async function getStaticPaths() {
  const trails = await getCollection("trails");
  const out = [];
  for (const t of trails) if ((await getEntry("derived", t.id))?.data.water) out.push({ params: { slug: t.id } });
  return out;
}

type Place = { lon: number; lat: number; kind: string; name?: string; osm?: string; source?: string };
// what the place is, in the words of the trail page's charts
const LABEL: Record<string, string> = {
  drinking: "Drinking water",
  spring: "Spring",
  supermarket: "Supermarket",
  convenience: "Convenience store",
  general: "General store",
  fuel: "Petrol station shop",
  hut: "Hut",
  campsite: "Campsite",
  hostel: "Hostel",
  guesthouse: "Guest house",
};

export const GET: APIRoute = async ({ params }) => {
  const d = (await getEntry("derived", params.slug!))!.data;
  const sources = (await getEntry("trails", params.slug!))!.data.sources;
  // where the place's popup links: its OSM object, or for a record's own water points their source's page
  const link = (p: Place) => (p.osm ? `https://www.openstreetmap.org/${p.osm}` : (sources.find((s) => s.id === p.source)?.url ?? ""));
  const row = (p: Place) => [+p.lon.toFixed(5), +p.lat.toFixed(5), LABEL[p.kind] ?? "Place", p.name ?? "", link(p)];
  const water = (d.water?.points ?? []) as Place[];
  const body = {
    drinking: water.filter((p) => p.kind === "drinking").map(row),
    springs: water.filter((p) => p.kind === "spring").map(row),
    shops: ((d.along?.resupply.points ?? []) as Place[]).map(row),
    beds: ((d.along?.beds.points ?? []) as Place[]).map(row),
  };
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
};
