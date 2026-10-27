<script lang="ts">
  // Searches, filters and sorts the trail index in the browser; the index is small enough
  // to ship whole.
  import { onMount } from "svelte";
  import { SLEEPING_CATEGORIES, type TrailSummary } from "../lib/trails";

  let { trails }: { trails: TrailSummary[] } = $props();

  const SAC = ["T1", "T2", "T3", "T4", "T5", "T6"];

  let query = $state("");
  // a search handed over in the link: /trails/?q=…
  onMount(() => {
    query = new URLSearchParams(location.search).get("q") ?? "";
  });
  let continent = $state("");
  let country = $state("");
  let maxSac = $state("");
  let wild = $state("");
  let sleeping = $state("");
  let sortKey = $state<"name" | "countries" | "days" | "lengthKm" | "ascentM" | "sac">("name");
  let sortDir = $state(1);

  const uniq = (xs: string[]) => [...new Set(xs)].sort();
  const continents = uniq(trails.flatMap((t) => t.continents));
  const countries = uniq(trails.flatMap((t) => t.countries));
  // sleeping categories (see SLEEPING_CATEGORIES) that at least one trail has
  const sleepingCategories = SLEEPING_CATEGORIES.filter((c) => trails.some((t) => t.sleeping.includes(c.id)));

  const matches = (t: TrailSummary, q: string) =>
    [t.name, t.localName ?? "", ...t.aliases, ...t.countries, ...t.regions, ...t.tags].join(" ").toLowerCase().includes(q);

  const sortValue = (t: TrailSummary) => {
    switch (sortKey) {
      case "name":
        return t.name;
      case "countries":
        return t.countries.join(", ");
      case "days":
        return t.days?.[0] ?? null;
      case "sac":
        return t.sac === null ? null : SAC.indexOf(t.sac);
      default:
        return t[sortKey];
    }
  };

  let shown = $derived(
    trails
      .filter(
        (t) =>
          (!query || matches(t, query.trim().toLowerCase())) &&
          (!continent || t.continents.includes(continent)) &&
          (!country || t.countries.includes(country)) &&
          (!maxSac || (t.sac !== null && SAC.indexOf(t.sac) <= SAC.indexOf(maxSac))) &&
          (!wild ||
            (wild === "some" ? t.wildCamping === "allowed" || t.wildCamping === "restricted" : t.wildCamping === wild)) &&
          (!sleeping || t.sleeping.includes(sleeping)),
      )
      .sort((a, b) => {
        const x = sortValue(a);
        const y = sortValue(b);
        if (x === y) return a.name.localeCompare(b.name);
        if (x === null) return 1; // unknown values last, whichever direction
        if (y === null) return -1;
        return (typeof x === "string" ? x.localeCompare(y as string) : x - (y as number)) * sortDir;
      }),
  );

  const filtered = $derived(Boolean(query || continent || country || maxSac || wild || sleeping));

  function sortBy(key: typeof sortKey) {
    sortDir = sortKey === key ? -sortDir : 1;
    sortKey = key;
  }

  function reset() {
    query = continent = country = maxSac = wild = sleeping = "";
  }

  const fmt = (n: number | null, unit: string) => (n === null ? "–" : `${n.toLocaleString("en")} ${unit}`);
  const days = (d: [number, number] | null) => (d === null ? "–" : d[0] === d[1] ? `${d[0]}` : `${d[0]}–${d[1]}`);
  const columns: [typeof sortKey, string, boolean][] = [
    ["name", "Trail", false],
    ["countries", "Country", false],
    ["days", "Days", true],
    ["lengthKm", "Length", true],
    ["ascentM", "Ascent", true],
    ["sac", "Difficulty", false],
  ];
</script>

<div class="search">
  <input type="search" placeholder="Search by name, country, region…" bind:value={query} aria-label="Search trails" />
</div>

<div class="filters">
  <label>
    Continent
    <select bind:value={continent}>
      <option value="">All</option>
      {#each continents as c}<option value={c}>{c}</option>{/each}
    </select>
  </label>
  <label>
    Country
    <select bind:value={country}>
      <option value="">All</option>
      {#each countries as c}<option value={c}>{c}</option>{/each}
    </select>
  </label>
  <label>
    Difficulty up to
    <select bind:value={maxSac}>
      <option value="">Any</option>
      {#each SAC as s}<option value={s}>SAC {s}</option>{/each}
    </select>
  </label>
  <label>
    Wild camping
    <select bind:value={wild}>
      <option value="">Any</option>
      <option value="allowed">Allowed</option>
      <option value="some">Allowed or restricted</option>
      <option value="prohibited">Prohibited</option>
    </select>
  </label>
  <label>
    Sleeping
    <select bind:value={sleeping}>
      <option value="">Any</option>
      {#each sleepingCategories as c}<option value={c.id}>{c.label}</option>{/each}
    </select>
  </label>
</div>

<p class="count">
  <span class="muted">{shown.length} of {trails.length} {trails.length === 1 ? "trail" : "trails"}</span>
  {#if filtered}<button type="button" class="link" onclick={reset}>Clear filters</button>{/if}
</p>

<div class="scroll">
  <table>
    <thead>
      <tr>
        {#each columns as [key, label, numeric]}
          <th class:num={numeric} aria-sort={sortKey === key ? (sortDir === 1 ? "ascending" : "descending") : "none"}>
            <button type="button" onclick={() => sortBy(key)}>
              {label}<span class="arrow">{sortKey === key ? (sortDir === 1 ? "↑" : "↓") : ""}</span>
            </button>
          </th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each shown as t (t.slug)}
        <tr>
          <td>
            <a href={`/trails/${t.slug}/`}>{t.name}</a>
            {#if t.draft}<span class="badge">draft</span>{/if}
            {#if t.localName}<div class="local muted">{t.localName}</div>{/if}
          </td>
          <td>{t.countries.join(", ")}</td>
          <td class="num">{days(t.days)}</td>
          <td class="num">{fmt(t.lengthKm, "km")}</td>
          <td class="num">{fmt(t.ascentM, "m")}</td>
          <td>{t.sac ? `SAC ${t.sac}` : "–"}</td>
        </tr>
      {:else}
        <tr><td colspan="6" class="empty muted">No trails match. Try fewer filters.</td></tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .search input {
    width: 100%;
    max-width: 480px;
    padding: 10px 14px;
    border-radius: 999px;
  }
  .filters {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 12px;
    margin-top: 16px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.8rem;
    color: var(--muted);
  }
  .count {
    display: flex;
    gap: 16px;
    align-items: baseline;
    margin: 24px 0 8px;
    font-size: 0.9rem;
  }
  .link {
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent);
    font: inherit;
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .scroll {
    overflow-x: auto;
  }
  table {
    border-collapse: collapse;
    width: 100%;
  }
  th,
  td {
    padding: 12px;
    border-bottom: 1px solid var(--line);
    text-align: left;
    white-space: nowrap;
  }
  th {
    padding-top: 4px;
    padding-bottom: 4px;
  }
  th button {
    padding: 4px 0;
    border: 0;
    background: none;
    color: var(--muted);
    font: 500 0.8rem var(--sans);
    letter-spacing: 0.03em;
    text-transform: uppercase;
    cursor: pointer;
  }
  th button:hover,
  th[aria-sort="ascending"] button,
  th[aria-sort="descending"] button {
    color: var(--text);
  }
  .arrow {
    display: inline-block;
    width: 1em;
  }
  tbody tr:hover {
    background: var(--surface);
  }
  td a {
    font-weight: 600;
    text-decoration: none;
    color: var(--text);
  }
  td a:hover {
    color: var(--accent);
  }
  .local {
    font-size: 0.85rem;
  }
  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .empty {
    padding: 32px 12px;
    text-align: center;
  }
</style>
