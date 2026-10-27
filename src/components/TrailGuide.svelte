<script lang="ts">
  // The guided search: the search page's filters as one question per screen, then a summary that
  // opens the search page with those filters in its URL. Every answer shows how many trails it
  // would leave, counted with the same test as the search page (src/lib/filters.ts).
  import { onMount } from "svelte";
  import { SAC_SCALE, SLEEPING_CATEGORIES, type TrailSummary } from "../lib/trails";
  import {
    DAYS,
    DAYS_ALL,
    MONTHS,
    NATURAL_PCT,
    SAC,
    WATER_KM,
    matches,
    noFilters,
    places as placesOf,
    toParams,
    type Filters,
  } from "../lib/filters";

  let { trails }: { trails: TrailSummary[] } = $props();

  const at = (stops: number[], v: number) => stops.indexOf(v);
  const sleepingOptions = SLEEPING_CATEGORIES.filter((c) => c.id !== "wild-camping");
  const places = placesOf(trails);
  const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  // single-choice questions: each option sets its filter fields; the last option of each is "any"
  type Option = { label: string; sub?: string; set: Partial<Filters> };
  const DAY_OPTIONS: Option[] = [
    { label: "A long weekend", sub: "Up to 3 days", set: { dayLo: 0, dayHi: at(DAYS, 3) } },
    { label: "About a week", sub: "4 to 7 days", set: { dayLo: at(DAYS, 4), dayHi: at(DAYS, 7) } },
    { label: "One to two weeks", sub: "8 to 14 days", set: { dayLo: at(DAYS, 8), dayHi: at(DAYS, 14) } },
    { label: "Longer than two weeks", sub: "15 days or more", set: { dayLo: at(DAYS, 15), dayHi: DAYS_ALL } },
    { label: "Doesn't matter", set: { dayLo: 0, dayHi: DAYS_ALL } },
  ];
  const SAC_OPTIONS: Option[] = [
    ...SAC.map((s, i) => ({ label: `${s} · ${SAC_SCALE[s].name}`, sub: SAC_SCALE[s].text, set: { sacMax: i } })),
    { label: "I'm not sure", sub: "Any grade, and trails without one", set: { sacMax: SAC.length } },
  ];
  const WILD_OPTIONS: Option[] = [
    { label: "Yes, it should be allowed", sub: "Pitch a tent anywhere along the trail", set: { wild: "allowed" } },
    { label: "Where possible", sub: "Also at set places or under rules, such as bivouac sites", set: { wild: "some" } },
    { label: "No need", set: { wild: "" } },
  ];
  const WATER_OPTIONS: Option[] = [
    { label: "Up to 10 km", sub: "Water within a couple of hours", set: { waterMax: at(WATER_KM, 10) } },
    { label: "Up to 20 km", sub: "About half a day", set: { waterMax: at(WATER_KM, 20) } },
    { label: "Up to 30 km", sub: "A full day's walk", set: { waterMax: at(WATER_KM, 30) } },
    { label: "Doesn't matter", sub: "I'll carry or filter what I need", set: { waterMax: WATER_KM.length } },
  ];
  const TERRAIN_OPTIONS: Option[] = [
    { label: "Mostly natural paths", sub: "70 % or more on earth, grass or rock", set: { naturalMin: at(NATURAL_PCT, 70) } },
    { label: "At least half natural", sub: "50 % or more", set: { naturalMin: at(NATURAL_PCT, 50) } },
    { label: "Don't mind", sub: "Gravel tracks and paved roads are fine", set: { naturalMin: 0 } },
  ];

  const STEPS = [
    { id: "when", question: "When would you like to go?", help: "Pick every month that works. Trails whose season includes any of them stay." },
    { id: "days", question: "How many days do you have?", help: "A trail stays if the days its managers suggest overlap yours." },
    { id: "hard", question: "How demanding may it be?", help: "The Swiss Alpine Club's hiking scale; we translate each trail's own rating into it." },
    { id: "where", question: "Where would you like to hike?" },
    { id: "sleep", question: "Where would you like to sleep?", help: "Pick everything you'll need. A trail stays if it offers all of them." },
    { id: "wild", question: "Would you like to camp in the wild?" },
    { id: "water", question: "How far can you go between drinking water?", help: "The longest stretch of the trail without a tap, fountain or drinking spring." },
    { id: "terrain", question: "What would you like underfoot?" },
  ];

  let f = $state<Filters>(noFilters());
  let step = $state(0); // STEPS.length: the summary
  let heading = $state<HTMLElement>();

  const count = (filters: Filters) => trails.filter((t) => matches(t, filters)).length;
  const countWith = (set: Partial<Filters>) => count({ ...f, ...set });
  const isSet = (set: Partial<Filters>) => Object.entries(set).every(([k, v]) => f[k as keyof Filters] === v);
  const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
  const trailsWord = (n: number) => `${n} ${n === 1 ? "trail" : "trails"}`;
  let total = $derived(count(f));

  // has this question been answered (anything other than "any")?
  const answered = (id: string) =>
    ({
      when: f.months.length > 0,
      days: f.dayLo > 0 || f.dayHi < DAYS_ALL,
      hard: f.sacMax < SAC.length,
      where: f.where !== "",
      sleep: f.sleep.length > 0,
      wild: f.wild !== "",
      water: f.waterMax < WATER_KM.length,
      terrain: f.naturalMin > 0,
    })[id]!;
  // the answer in words, for the summary
  const pick = (options: Option[]) => options.find((o) => isSet(o.set))?.label ?? "";
  const answerText = (id: string) =>
    ({
      when: [...f.months].sort((a, b) => a - b).map((m) => MONTH_NAMES[m - 1]).join(", "),
      days: pick(DAY_OPTIONS),
      hard: pick(SAC_OPTIONS),
      where: f.where,
      sleep: sleepingOptions.filter((c) => f.sleep.includes(c.id)).map((c) => c.label).join(", "),
      wild: pick(WILD_OPTIONS),
      water: pick(WATER_OPTIONS),
      terrain: pick(TERRAIN_OPTIONS),
    })[id]!;
  // the filter fields one question sets, back to "any"
  const clear = (id: string): Partial<Filters> =>
    ({
      when: { months: [] },
      days: { dayLo: 0, dayHi: DAYS_ALL },
      hard: { sacMax: SAC.length },
      where: { where: "" },
      sleep: { sleep: [] },
      wild: { wild: "" as const },
      water: { waterMax: WATER_KM.length },
      terrain: { naturalMin: 0 },
    })[id]!;

  // each question is a history entry, so the browser's back button goes to the previous one
  function go(to: number) {
    step = to;
    history.pushState({ step: to }, "", `#${to < STEPS.length ? STEPS[to].id : "summary"}`);
    queueMicrotask(() => heading?.focus());
  }
  onMount(() => {
    history.replaceState({ step: 0 }, "", location.pathname);
    const back = (e: PopStateEvent) => (step = e.state?.step ?? 0);
    addEventListener("popstate", back);
    return () => removeEventListener("popstate", back);
  });

  let resultsHref = $derived(`/trails/${toParams(f).toString() ? `?${toParams(f)}` : ""}`);
</script>

<div class="guide">
  <div class="progress" aria-hidden="true">
    <span style={`width: ${(Math.min(step, STEPS.length) / STEPS.length) * 100}%`}></span>
  </div>

  {#if step < STEPS.length}
    {@const s = STEPS[step]}
    <p class="step-no">Question {step + 1} of {STEPS.length}</p>
    <h2 tabindex="-1" bind:this={heading}>{s.question}</h2>
    {#if s.help}<p class="help">{s.help}</p>{/if}

    <div class="answers">
      {#if s.id === "when"}
        <div class="months" role="group" aria-label="Months">
          {#each MONTHS as m, i}
            <button type="button" class="month" aria-pressed={f.months.includes(i + 1)} onclick={() => (f.months = toggle(f.months, i + 1))}>
              <span class="visually-hidden">{MONTH_NAMES[i]}</span><span aria-hidden="true">{m}</span>
            </button>
          {/each}
        </div>
        <button type="button" class="option wide" aria-pressed={f.months.length === 0} onclick={() => (f.months = [])}>
          <span class="label">Any time</span><span class="count">{trailsWord(countWith({ months: [] }))}</span>
        </button>
      {:else if s.id === "days"}
        {#each DAY_OPTIONS as o}
          {@render option(o)}
        {/each}
      {:else if s.id === "hard"}
        {#each SAC_OPTIONS as o}
          {@render option(o)}
        {/each}
      {:else if s.id === "where"}
        {@render option({ label: "Anywhere", set: { where: "" } })}
        {#each places as p}
          {@render option({ label: `Anywhere in ${p.continent}`, set: { where: p.continent } })}
          <div class="countries">
            {#each p.countries as c}
              {@render option({ label: c, set: { where: c } }, true)}
            {/each}
          </div>
        {/each}
      {:else if s.id === "sleep"}
        {#each sleepingOptions as c}
          <button type="button" class="option" aria-pressed={f.sleep.includes(c.id)} onclick={() => (f.sleep = toggle(f.sleep, c.id))}>
            <span class="label">{c.label}<span class="sub">{c.hint}</span></span>
            <!-- how many trails would have this kind too -->
            <span class="count">{trailsWord(countWith({ sleep: f.sleep.includes(c.id) ? f.sleep : [...f.sleep, c.id] }))}</span>
          </button>
        {/each}
        {@render option({ label: "No preference", set: { sleep: [] } })}
      {:else if s.id === "wild"}
        {#each WILD_OPTIONS as o}
          {@render option(o)}
        {/each}
      {:else if s.id === "water"}
        {#each WATER_OPTIONS as o}
          {@render option(o)}
        {/each}
      {:else if s.id === "terrain"}
        {#each TERRAIN_OPTIONS as o}
          {@render option(o)}
        {/each}
      {/if}
    </div>

    <p class="status" role="status">
      {#if total === 0}
        <strong>No trail matches all your answers so far.</strong> Change this answer, or go on and see what to drop at the end.
      {:else}
        <strong>{trailsWord(total)}</strong> {total === 1 ? "matches" : "match"} your answers so far.
      {/if}
    </p>

    <div class="nav">
      {#if step > 0}<button type="button" class="back" onclick={() => history.back()}>← Back</button>{/if}
      <button type="button" class="next" onclick={() => go(step + 1)}>
        {answered(s.id) ? (step === STEPS.length - 1 ? "See the result" : "Next") : "Skip"}
      </button>
    </div>
  {:else}
    <p class="step-no">Your answers</p>
    <h2 tabindex="-1" bind:this={heading}>
      {total === 0 ? "No trail matches all your answers" : `${trailsWord(total)} ${total === 1 ? "matches" : "match"} your answers`}
    </h2>

    <dl class="summary">
      {#each STEPS as q, i}
        <div>
          <dt>{q.question}</dt>
          <dd>
            {answered(q.id) ? answerText(q.id) : "No preference"}
            <button type="button" class="link" onclick={() => go(i)}>Change<span class="visually-hidden">: {q.question}</span></button>
          </dd>
        </div>
      {/each}
    </dl>

    {#if total === 0}
      {@const relax = STEPS.filter((q) => answered(q.id)).map((q) => ({ q, n: count({ ...f, ...clear(q.id) }) })).filter((r) => r.n > 0)}
      {#if relax.length}
        <p class="help">Leave out one answer to find trails:</p>
        <div class="relax">
          {#each relax as r}
            <button type="button" class="option" onclick={() => Object.assign(f, clear(r.q.id))}>
              <span class="label">Any answer to “{r.q.question}”<span class="sub">instead of {answerText(r.q.id)}</span></span>
              <span class="count">{trailsWord(r.n)}</span>
            </button>
          {/each}
        </div>
      {:else}
        <p class="help">Leaving out a single answer doesn't help here: change two of them, or see all trails.</p>
      {/if}
    {/if}

    <div class="nav">
      <button type="button" class="back" onclick={() => history.back()}>← Back</button>
      {#if total > 0}
        <a class="next" href={resultsHref}>Show {trailsWord(total)}</a>
      {:else}
        <a class="next" href="/trails/">See all trails</a>
      {/if}
    </div>
  {/if}
</div>

{#snippet option(o: Option, small = false)}
  <button type="button" class="option" class:small aria-pressed={isSet(o.set)} onclick={() => Object.assign(f, o.set)}>
    <span class="label">{o.label}{#if o.sub}<span class="sub">{o.sub}</span>{/if}</span>
    <span class="count">{trailsWord(countWith(o.set))}</span>
  </button>
{/snippet}

<style>
  .guide {
    max-width: 640px;
    margin: 0 auto;
  }
  .progress {
    height: 4px;
    margin-bottom: 28px;
    border-radius: 2px;
    background: var(--line);
    overflow: hidden;
  }
  .progress span {
    display: block;
    height: 100%;
    background: var(--accent);
    transition: width 0.25s ease;
  }
  .step-no {
    margin: 0;
    color: var(--muted);
    font-size: 0.85rem;
  }
  h2 {
    margin: 4px 0 8px;
    font-size: clamp(1.5rem, 4vw, 2rem);
    line-height: 1.2;
  }
  h2:focus {
    outline: none;
  }
  .help {
    margin: 0 0 4px;
    color: var(--muted);
  }
  .answers,
  .relax {
    display: grid;
    gap: 8px;
    margin-top: 20px;
  }
  .option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 14px 18px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--bg);
    color: var(--text);
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition: border-color 0.15s ease;
  }
  .option:hover {
    border-color: var(--muted);
  }
  .option[aria-pressed="true"] {
    border-color: var(--accent);
    box-shadow: inset 0 0 0 1px var(--accent);
    background: var(--accent-soft);
  }
  .option.small {
    padding: 10px 14px;
  }
  .label {
    display: grid;
    gap: 2px;
    font-weight: 600;
  }
  .sub {
    color: var(--muted);
    font-size: 0.85rem;
    font-weight: 400;
    line-height: 1.4;
  }
  .count {
    flex: none;
    color: var(--muted);
    font-size: 0.85rem;
    font-variant-numeric: tabular-nums;
  }
  .countries {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 8px;
    padding-left: 20px;
  }
  .months {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 8px;
  }
  @media (max-width: 479px) {
    .months {
      grid-template-columns: repeat(4, 1fr);
    }
  }
  .month {
    padding: 14px 0;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--bg);
    color: var(--text);
    font: 600 1rem var(--sans);
    cursor: pointer;
  }
  .month:hover {
    border-color: var(--muted);
  }
  .month[aria-pressed="true"] {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--bg);
  }
  .status {
    margin: 20px 0 0;
    color: var(--muted);
  }
  .status strong {
    color: var(--text);
  }
  .nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-top: 28px;
  }
  .back {
    padding: 12px 4px;
    border: 0;
    background: none;
    color: var(--muted);
    font: 500 1rem var(--sans);
    cursor: pointer;
  }
  .back:hover {
    color: var(--text);
  }
  .next {
    margin-left: auto;
    padding: 12px 28px;
    border: 0;
    border-radius: 999px;
    background: var(--accent);
    color: var(--bg);
    font: 600 1rem var(--sans);
    text-decoration: none;
    cursor: pointer;
  }
  .next:hover {
    filter: brightness(1.08);
  }
  .summary {
    margin: 24px 0 0;
    border-top: 1px solid var(--text);
  }
  .summary > div {
    padding: 12px 0;
    border-bottom: 1px solid var(--line);
  }
  .summary dt {
    color: var(--muted);
    font-size: 0.85rem;
  }
  .summary dd {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    margin: 2px 0 0;
    font-weight: 600;
  }
  .link {
    flex: none;
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent);
    font: 500 0.9rem var(--sans);
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
  }
  .option:focus-visible,
  .month:focus-visible,
  .next:focus-visible,
  .back:focus-visible,
  .link:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  @media (prefers-reduced-motion: reduce) {
    .progress span,
    .option {
      transition: none;
    }
  }
</style>
