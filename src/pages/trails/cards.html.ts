// The search page's cards beyond the first CARDS_IN_PAGE (issue #93), as an HTML fragment the page
// fetches once its trails are in (TrailList.svelte) and appends to its list: the page's HTML keeps the
// same size however many trails there are. Rendered with the same component as the page's cards, so
// they look and filter the same. An endpoint, not a page, so the sitemap leaves it out.
import type { APIRoute } from "astro";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import TrailCards from "../../components/TrailCards.astro";
import { CARDS_IN_PAGE, allSearchTrails, eleRangeOf } from "../../lib/search-all";

export const GET: APIRoute = async () => {
  const trails = await allSearchTrails();
  const container = await AstroContainer.create();
  const html = await container.renderToString(TrailCards, { props: { trails: trails.slice(CARDS_IN_PAGE), eleRange: eleRangeOf(trails) } });
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
};
