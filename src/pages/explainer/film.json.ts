// The explainer film's data (src/lib/explainer/data.ts), fetched by the player only when a visitor
// presses play, so the home page carries none of it.
import type { APIRoute } from "astro";
import { filmData } from "../../lib/explainer/data";

export const GET: APIRoute = async () => new Response(JSON.stringify(await filmData()), { headers: { "Content-Type": "application/json" } });
