// The link-preview image of each page that isn't a trail, /og/page/<page>.png (src/lib/og-pages.ts),
// rendered at build time; the pages name it in their Open Graph and Twitter tags (Base.astro's `image`).
import type { APIRoute } from "astro";
import { OG_PAGES, ogPagePng, type OgPage } from "../../../lib/og-pages";

export function getStaticPaths() {
  return OG_PAGES.map((page) => ({ params: { page } }));
}

export const GET: APIRoute = async ({ params }) => new Response(new Uint8Array(await ogPagePng(params.page as OgPage)), { headers: { "Content-Type": "image/png" } });
