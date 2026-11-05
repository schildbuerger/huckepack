// /gpx/<slug>.gpx: our own GPX of a trail, only where the operator offers none (src/lib/gpx.ts)
import type { APIRoute, GetStaticPaths } from "astro";
import { getCollection } from "astro:content";
import { gpxDocument, ownGpx } from "../../lib/gpx";

export const getStaticPaths: GetStaticPaths = async () =>
  (await getCollection("trails")).flatMap((trail) => {
    const own = ownGpx(trail.id, trail.data.officialGpx);
    return own ? [{ params: { slug: trail.id }, props: { name: trail.data.name, own } }] : [];
  });

export const GET: APIRoute = ({ props, params, site }) =>
  new Response(gpxDocument(props.name, new URL(`/trails/${params.slug}/`, site).href, props.own), {
    headers: { "Content-Type": "application/gpx+xml" },
  });
