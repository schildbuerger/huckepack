<script lang="ts">
  // Filters the trail index in the browser; the index is small enough to ship whole.
  export interface TrailSummary {
    slug: string;
    name: string;
    continents: string[];
    countries: string[];
    lengthKm: number | null;
    ascentM: number | null;
    days: [number, number] | null;
    sac: string | null;
    wildCamping: "allowed" | "restricted" | "prohibited" | null;
    sleeping: string[];
    tags: string[];
    draft: boolean;
  }

  let { trails }: { trails: TrailSummary[] } = $props();

  const SAC = ["T1", "T2", "T3", "T4", "T5", "T6"];
  const SLEEPING: Record<string, string> = {
    hut: "Huts / rifugi",
    bivouac: "Bivouac shelters",
    campsite: "Campsites",
    hostel: "Hostels",
    guesthouse: "B&Bs and guesthouses",
    hotel: "Hotels",
    monastery: "Monastery guest houses",
    "farm-stay": "Farm stays",
  };

  let continent = $state("");
  let country = $state("");
  let maxSac = $state("");
  let wild = $state("");
  let sleeping = $state("");
  let tag = $state("");

  const uniq = (xs: string[]) => [...new Set(xs)].sort();
  const continents = uniq(trails.flatMap((t) => t.continents));
  const countries = uniq(trails.flatMap((t) => t.countries));
  const sleepingTypes = Object.keys(SLEEPING).filter((s) => trails.some((t) => t.sleeping.includes(s)));
  const tags = uniq(trails.flatMap((t) => t.tags));

  let shown = $derived(
    trails.filter(
      (t) =>
        (!continent || t.continents.includes(continent)) &&
        (!country || t.countries.includes(country)) &&
        (!maxSac || (t.sac !== null && SAC.indexOf(t.sac) <= SAC.indexOf(maxSac))) &&
        (!wild || (wild === "some" ? t.wildCamping === "allowed" || t.wildCamping === "restricted" : t.wildCamping === wild)) &&
        (!sleeping || t.sleeping.includes(sleeping)) &&
        (!tag || t.tags.includes(tag)),
    ),
  );

  const fmt = (n: number | null, unit: string) => (n === null ? "–" : `${n.toLocaleString("en")} ${unit}`);
  const days = (d: [number, number] | null) => (d === null ? "–" : d[0] === d[1] ? `${d[0]}` : `${d[0]}–${d[1]}`);
</script>

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
      {#each sleepingTypes as s}<option value={s}>{SLEEPING[s]}</option>{/each}
    </select>
  </label>
  <label>
    Tag
    <select bind:value={tag}>
      <option value="">All</option>
      {#each tags as t}<option value={t}>{t}</option>{/each}
    </select>
  </label>
</div>

<p class="muted">{shown.length} of {trails.length} trails</p>

<div class="scroll">
  <table>
    <thead>
      <tr>
        <th>Trail</th>
        <th>Country</th>
        <th class="num">Days</th>
        <th class="num">Length</th>
        <th class="num">Ascent</th>
        <th>SAC</th>
      </tr>
    </thead>
    <tbody>
      {#each shown as t (t.slug)}
        <tr>
          <td>
            <a href={`/trails/${t.slug}/`}>{t.name}</a>
            {#if t.draft}<span class="badge">draft</span>{/if}
          </td>
          <td>{t.countries.join(", ")}</td>
          <td class="num">{days(t.days)}</td>
          <td class="num">{fmt(t.lengthKm, "km")}</td>
          <td class="num">{fmt(t.ascentM, "m")}</td>
          <td>{t.sac ?? "–"}</td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .filters {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 12px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 0.85em;
    color: var(--muted);
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
    padding: 8px;
    border-bottom: 1px solid var(--line);
    text-align: left;
    white-space: nowrap;
  }
  th {
    font-size: 0.85em;
    color: var(--muted);
    font-weight: 500;
  }
  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
</style>
