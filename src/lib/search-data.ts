// The trails' search summaries in the browser (issue #93): /trails/search.json, fetched once per page
// and shared by whatever needs it (the trail search, the trail map, the guide); the browser caches it
// between pages.
import type { ListedTrail } from "./search-all";

let loading: Promise<ListedTrail[]> | undefined;
export function loadTrails(): Promise<ListedTrail[]> {
  loading ??= fetch("/trails/search.json").then((r) => {
    if (!r.ok) throw new Error(`/trails/search.json: HTTP ${r.status}`);
    return r.json();
  });
  return loading;
}
