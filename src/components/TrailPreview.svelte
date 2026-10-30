<script lang="ts">
  // The picked trail on the trail map (src/components/TrailsMap.svelte): what a hiker would want to
  // see before opening its page, from the same search record the cards use (searchSummary()).
  // A card floating over the map at its right edge, beside the list (of three previews, approach A;
  // a column between map and list and a strip along the map's bottom were the others). The trail
  // map frames the trail in the room the card leaves (framePadding()).
  import type { SearchTrail } from "../lib/search";
  import { WATER_LEVELS } from "../lib/trails";
  import { LANDSCAPES, LEVEL_WORDS, MONTHS } from "../lib/filters";

  let { trail: t, onclose }: { trail: SearchTrail; onclose: () => void } = $props();

  const fmt = (n: number) => n.toLocaleString("en");
  const dayText = (d: [number, number]) => (d[0] === d[1] ? `${d[0]}` : `${d[0]}–${d[1]}`);
  const seasonText = (ms: number[]) => {
    const s = [...ms].sort((a, b) => a - b);
    return s.length === 12 ? "All year" : s.map((m) => MONTHS[m - 1]).join(", ");
  };
  const top = $derived(t.difficulty.length ? Math.max(...t.difficulty.map((d) => d.level)) : null);
  const levelSay = (d: SearchTrail["difficulty"][number]) =>
    d.low ? `${LEVEL_WORDS[d.low - 1]} to ${LEVEL_WORDS[d.level - 1]}` : LEVEL_WORDS[d.level - 1];
  const land = $derived.by(() => {
    const best = Object.entries(t.landscape ?? {}).sort((a, b) => b[1] - a[1])[0];
    const label = best && LANDSCAPES.find((l) => l.id === best[0])?.label;
    return label ? `${best[1] >= 0.5 ? "Mostly" : "Mainly"} ${label}` : null;
  });
  const SHAPE = { frequent: "full", regular: "half", scarce: "blocked", allowed: "full", restricted: "half", prohibited: "blocked" } as const;
  const TONE = { frequent: "good", regular: "fair", scarce: "poor", allowed: "good", restricted: "fair", prohibited: "poor" } as const;
  const WILD = { allowed: "Wild camping allowed", restricted: "Wild camping restricted", prohibited: "No wild camping" };
  const WATER_WORD = Object.fromEntries(WATER_LEVELS.map((l) => [l.id, l.label]));

  // the profile on the trail's own height range (the caption names it)
  const W = 300;
  const H = 70;
  const spark = $derived.by(() => {
    if (!t.profile) return null;
    const total = t.profile.at(-1)![0] || 1;
    const lo = t.lowestM ?? 0;
    const hi = Math.max(t.highestM ?? 1, lo + 1);
    const pts = t.profile.map(([km, m]) => `${((km / total) * W).toFixed(1)},${(H - ((m - lo) / (hi - lo)) * (H - 4)).toFixed(1)}`);
    return { area: `M0,${H}L${pts.join("L")}L${W},${H}Z`, line: `M${pts.join("L")}` };
  });
</script>

<section class="tp" aria-label={`${t.name}, preview`}>
  <button type="button" class="tp-close" aria-label="Close the preview" title="Close" onclick={onclose}>×</button>
  <header class="tp-head">
    <p class="tp-place">{t.countries.join(", ")}{#if t.regions.length}{" · "}{t.regions.slice(0, 2).join(", ")}{/if}</p>
    <h2>{t.name}</h2>
    <p class="tp-ends">{t.start} → {t.end}</p>
  </header>

  <dl class="tp-figs">
    {#if t.lengthKm !== null}<div><dt>Length</dt><dd>{fmt(t.lengthKm)}<span>km</span></dd></div>{/if}
    {#if t.days}<div><dt>Days</dt><dd>{dayText(t.days)}</dd></div>{/if}
    {#if t.climb}
      <div>
        <dt>{t.climb.est ? "Ascent, est." : "Ascent"}</dt>
        <dd>{#if t.climb.est}<span class="approx" aria-hidden="true">≈</span>{/if}{fmt(t.climb.m)}<span>m ↑</span></dd>
      </div>
    {/if}
    {#if top}
      <div>
        <dt>Difficulty</dt>
        <dd class="diff">
          <span class="sr-only">{t.difficulty.map((d) => `${d.label}: ${levelSay(d)}`).join("; ")}. Overall: </span>
          <span class="diff-bars" aria-hidden="true">
            {#each t.difficulty as d}
              <span class="diff-col" title={`${d.label}: ${levelSay(d)}`}>
                <span class="diff-bar range" style={`height: ${d.level * 25}%`}></span>
                <span class="diff-bar" style={`height: ${(d.low ?? d.level) * 25}%`}></span>
              </span>
            {/each}
          </span>
          {LEVEL_WORDS[top - 1]}
        </dd>
      </div>
    {/if}
  </dl>

  {#if spark}
    <figure class="tp-profile">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        <path class="area" d={spark.area} />
        <path class="line" d={spark.line} vector-effect="non-scaling-stroke" />
      </svg>
      {#if t.surface}
        <div class="surface" aria-hidden="true">
          <span style={`flex: ${t.surface.natural}; background: var(--surface-natural)`}></span>
          <span style={`flex: ${t.surface.gravel}; background: var(--surface-gravel)`}></span>
          <span style={`flex: ${t.surface.paved}; background: var(--surface-paved)`}></span>
        </div>
      {/if}
      <figcaption>
        {fmt(t.lowestM!)}–{fmt(t.highestM!)} m{#if t.surface}{" · "}{Math.round(t.surface.natural * 100)} % natural ground{/if}
      </figcaption>
    </figure>
  {/if}

  <div class="tp-more">
    {#if t.season}
      <div class="season" role="img" aria-label={`Season: ${seasonText(t.season)}`}>
        {#each MONTHS as m, i}
          <span class="month" class:in={t.season.includes(i + 1)} title={m}>{m[0]}</span>
        {/each}
      </div>
    {/if}
    <ul class="tp-facts">
      {#if land}<li>{land}</li>{/if}
      {#if t.water}
        <li><span class={`mark ${SHAPE[t.water.level]} tone-${TONE[t.water.level]}`} aria-hidden="true"></span>{WATER_WORD[t.water.level]} water</li>
      {/if}
      {#if t.wildCamping}
        <li><span class={`mark ${SHAPE[t.wildCamping]} tone-${TONE[t.wildCamping]}`} aria-hidden="true"></span>{WILD[t.wildCamping]}</li>
      {/if}
    </ul>
    <a class="tp-open" href={`/trails/${t.slug}/`}>Open the trail page <span aria-hidden="true">→</span></a>
  </div>
</section>

<style>
  /* a card at the map's right edge, beside the list, left of the map's buttons */
  .tp {
    position: absolute;
    z-index: 5;
    top: 12px;
    right: 56px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    width: 340px;
    max-height: calc(100% - 48px);
    overflow-y: auto;
    padding: 16px;
    border: 1px solid var(--line);
    border-radius: 14px;
    background: var(--bg);
    color: var(--text);
    box-shadow: 0 10px 30px rgb(0 0 0 / 0.16);
  }

  .tp-close {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 32px;
    height: 32px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: none;
    color: var(--muted);
    font-size: 1.4rem;
    line-height: 1;
    cursor: pointer;
  }
  .tp-close:hover,
  .tp-close:focus-visible {
    background: var(--surface);
    color: var(--text);
  }
  .tp-head {
    padding-right: 28px;
  }
  .tp-head p {
    margin: 0;
  }
  .tp-place,
  .tp-ends {
    color: var(--muted);
    font-size: 0.8rem;
  }
  .tp-head h2 {
    margin: 2px 0 2px;
    font-size: 1.45rem;
    line-height: 1.2;
  }

  .tp-figs {
    display: flex;
    flex-wrap: wrap;
    gap: 10px 18px;
    margin: 0;
    padding-top: 10px;
    border-top: 1px solid var(--text);
  }
  .tp-figs div {
    display: flex;
    flex-direction: column-reverse;
    justify-content: flex-end;
  }
  .tp-figs dt {
    color: var(--muted);
    font-size: 0.72rem;
  }
  .tp-figs dd {
    margin: 0;
    font-family: var(--serif);
    font-size: 1.35rem;
    line-height: 1.2;
    white-space: nowrap;
  }
  .tp-figs dd span:not(.sr-only):not(.diff-bars):not(.approx) {
    margin-left: 2px;
    color: var(--muted);
    font-family: var(--sans);
    font-size: 0.75rem;
  }
  .approx {
    color: var(--muted);
  }
  .tp-figs dd.diff {
    display: flex;
    align-items: flex-end;
    gap: 6px;
  }
  .diff-bars {
    display: flex;
    gap: 3px;
    height: 1.3rem;
    padding-bottom: 0.2rem;
  }
  .diff-col {
    position: relative;
    width: 7px;
    background: var(--line);
    border-radius: 2px 2px 0 0;
  }
  .diff-bar {
    position: absolute;
    inset: auto 0 0;
    background: var(--text);
    border-radius: 2px 2px 0 0;
  }
  .diff-bar.range {
    opacity: 0.4;
  }

  .tp-profile {
    display: flex;
    flex-direction: column;
    margin: 0;
  }
  .tp-profile svg {
    display: block;
    width: 100%;
    height: 70px;
  }
  .tp-profile .area {
    fill: var(--accent);
    opacity: 0.14;
  }
  .tp-profile .line {
    fill: none;
    stroke: var(--accent);
    stroke-width: 1.5;
    stroke-linejoin: round;
  }
  .surface {
    display: flex;
    gap: 2px;
    height: 6px;
    margin-top: 4px;
  }
  .surface span {
    border-radius: 2px;
  }
  .tp-profile figcaption {
    margin-top: 6px;
    color: var(--muted);
    font-size: 0.75rem;
  }

  .tp-more {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .season {
    display: grid;
    grid-template-columns: repeat(12, 1fr);
    gap: 2px;
  }
  .month {
    padding: 2px 0;
    border-radius: 3px;
    background: var(--surface);
    color: var(--muted);
    font-size: 0.65rem;
    font-weight: 600;
    text-align: center;
  }
  .month.in {
    background: color-mix(in srgb, var(--text) 72%, var(--bg));
    color: var(--bg);
  }
  .tp-facts {
    display: flex;
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: 0.85rem;
  }
  .tp-facts {
    flex-direction: row;
    flex-wrap: wrap;
    gap: 4px 14px;
  }
  .tp-facts li {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .mark {
    flex: none;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 1.5px solid var(--tone);
  }
  .mark.full {
    background: var(--tone);
  }
  .mark.half {
    background: linear-gradient(90deg, var(--tone) 50%, transparent 50%);
  }
  .mark.blocked {
    background: linear-gradient(135deg, transparent 43%, var(--tone) 43% 57%, transparent 57%);
  }
  .tone-good {
    --tone: var(--good);
  }
  .tone-fair {
    --tone: var(--fair);
  }
  .tone-poor {
    --tone: var(--poor);
  }
  .tp-open {
    align-self: flex-start;
    padding: 9px 16px;
    border-radius: 999px;
    background: var(--accent);
    color: var(--bg);
    font-weight: 600;
    font-size: 0.9rem;
    text-decoration: none;
  }
  .tp-open:hover,
  .tp-open:focus-visible {
    filter: brightness(1.1);
  }

  /* phones: a slim sheet along the map's bottom with the essentials (the map frames the trail
     above it) */
  @media (max-width: 899px) {
    .tp {
      inset: auto 8px 28px;
      width: auto;
      max-height: 70%;
      gap: 8px;
      padding: 10px 14px;
    }
    .tp-place,
    .tp-ends,
    .tp-profile,
    .season,
    .tp-facts {
      display: none;
    }
    .tp-head h2 {
      margin: 0;
      font-size: 1.15rem;
    }
    .tp-figs {
      padding-top: 6px;
      gap: 6px 14px;
    }
    .tp-figs dd {
      font-size: 1.1rem;
    }
    .tp-open {
      padding: 6px 14px;
      font-size: 0.85rem;
    }
  }
</style>
