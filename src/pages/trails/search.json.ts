// Every trail's search summary (src/lib/search-all.ts, issue #93), loaded once by the trail search,
// the trail map and the guide.
import type { APIRoute } from "astro";
import { allSearchTrails } from "../../lib/search-all";

export const GET: APIRoute = async () => new Response(JSON.stringify(await allSearchTrails()), { headers: { "Content-Type": "application/json" } });
