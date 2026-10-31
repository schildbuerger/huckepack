// Each trail's link-preview image, /og/<slug>.png (src/lib/og-image.ts), rendered at build time;
// the trail page names it in its Open Graph and Twitter tags (Base.astro's `image`).
import type { APIRoute } from "astro";
import { ogPng } from "../../lib/og-image";
import { ogTrails } from "../../lib/og-trail";

export async function getStaticPaths() {
  return (await ogTrails()).map(({ slug, trail }) => ({ params: { slug }, props: { trail } }));
}

export const GET: APIRoute = async ({ props }) => new Response(new Uint8Array(await ogPng(props.trail)), { headers: { "Content-Type": "image/png" } });
