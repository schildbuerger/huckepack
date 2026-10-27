<script lang="ts">
  // Filters the trail index in the browser; the index is small enough to ship whole.
  export interface TrailSummary {
    slug: string;
    name: string;
    region: string;
    lengthKm: number;
    tags: string[];
    draft: boolean;
  }

  let { trails }: { trails: TrailSummary[] } = $props();

  let tag = $state("");
  let region = $state("");

  const tags = [...new Set(trails.flatMap((t) => t.tags))].sort();
  const regions = [...new Set(trails.map((t) => t.region))].sort();

  let shown = $derived(
    trails.filter((t) => (!tag || t.tags.includes(tag)) && (!region || t.region === region)),
  );
</script>

<div class="filters">
  <label>
    Region
    <select bind:value={region}>
      <option value="">All</option>
      {#each regions as r}<option value={r}>{r}</option>{/each}
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

<ul>
  {#each shown as t (t.slug)}
    <li>
      <a href={`/trails/${t.slug}/`}>{t.name}</a>
      {#if t.draft}<span class="badge">draft</span>{/if}
      <span class="muted">· {t.region} · {t.lengthKm.toLocaleString("en")} km</span>
    </li>
  {/each}
</ul>

<style>
  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
  }
  label {
    display: flex;
    flex-direction: column;
    font-size: 0.9em;
  }
  ul {
    padding-left: 0;
    list-style: none;
  }
  li {
    padding: 8px 0;
    border-bottom: 1px solid var(--line);
  }
</style>
