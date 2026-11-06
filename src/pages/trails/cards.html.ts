// Every trail's card (issue #93), as an HTML fragment a page of the trail list fetches once its trails
// are in (TrailList.svelte) and adds the cards it doesn't carry itself (a page carries only its own,
// src/layouts/TrailsListing.astro): the page's HTML keeps the same size however many trails there are,
// and a filter or another page size can show any trail. Rendered with the same component as the page's cards, so
// they look and filter the same. An endpoint, not a page, so the sitemap leaves it out.
import type { APIRoute } from "astro";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import TrailCards from "../../components/TrailCards.astro";
import { allSearchTrails, eleRangeOf } from "../../lib/search-all";

export const GET: APIRoute = async () => {
  const trails = await allSearchTrails();
  const container = await AstroContainer.create();
  const html = await container.renderToString(TrailCards, { props: { trails, eleRange: eleRangeOf(trails) } });
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
};
