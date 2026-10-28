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
    toggleWhere,
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
    { id: "where", question: "Where would you like to hike?", help: "Pick as many places as you like. A continent includes all its countries." },
    { id: "sleep", question: "Where would you like to sleep?", help: "Pick everything you'll need. A trail stays if it offers all of them." },
    { id: "wild", question: "Would you like to camp in the wild?" },
    { id: "water", question: "How far can you go between drinking water?", help: "The longest stretch of the trail without a tap, fountain or drinking spring." },
    { id: "terrain", question: "What would you like underfoot?" },
  ];

  let f = $state<Filters>(noFilters());
  let step = $state(0); // STEPS.length: the summary
  let heading = $state<HTMLElement>();
  let guide = $state<HTMLElement>();

  const count = (filters: Filters) => trails.filter((t) => matches(t, filters)).length;
  const countWith = (set: Partial<Filters>) => count({ ...f, ...set });
  // lists (months, places, sleeping) compare by content
  const isSet = (set: Partial<Filters>) =>
    Object.entries(set).every(([k, v]) => JSON.stringify(f[k as keyof Filters]) === JSON.stringify(v));
  const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
  const trailsWord = (n: number) => `${n} ${n === 1 ? "trail" : "trails"}`;
  let total = $derived(count(f));

  // has this question been answered (anything other than "any")?
  const answered = (id: string) =>
    ({
      when: f.months.length > 0,
      days: f.dayLo > 0 || f.dayHi < DAYS_ALL,
      hard: f.sacMax < SAC.length,
      where: f.where.length > 0,
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
      where: f.where.join(", "),
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
      where: { where: [] },
      sleep: { sleep: [] },
      wild: { wild: "" as const },
      water: { waterMax: WATER_KM.length },
      terrain: { naturalMin: 0 },
    })[id]!;

  // each question is a history entry, so the browser's back button goes to the previous one
  // a new question starts at its top: scrolled down a long list on a phone, the page goes back up
  function go(to: number) {
    step = to;
    history.pushState({ step: to }, "", `#${to < STEPS.length ? STEPS[to].id : "summary"}`);
    queueMicrotask(() => {
      if (guide && guide.getBoundingClientRect().top < 0) scrollTo({ top: 0 });
      heading?.focus({ preventScroll: true });
    });
  }
  // the guide fills the screen below what's above it, so the pinned bar sits at the screen's
  // bottom edge on every question (CSS has an estimate for before this runs)
  const fit = () => guide?.style.setProperty("--top", `${guide.getBoundingClientRect().top + scrollY}px`);
  onMount(() => {
    history.replaceState({ step: 0 }, "", location.pathname);
    const back = (e: PopStateEvent) => (step = e.state?.step ?? 0);
    addEventListener("popstate", back);
    addEventListener("resize", fit);
    fit();
    return () => {
      removeEventListener("popstate", back);
      removeEventListener("resize", fit);
    };
  });

  let resultsHref = $derived(`/trails/${toParams(f).toString() ? `?${toParams(f)}` : ""}`);
</script>

<div class="guide" bind:this={guide}>
  {#if step === 0}
    <p class="intro">
      Eight short questions, one at a time. Skip any that don't matter to you; at the end you'll see the trails that fit.
    </p>
  {/if}
  <!-- the guide's status: the bar and its counter on one line; question n of 8 fills n/8 -->
  <div class="steps">
    <div class="progress" aria-hidden="true">
      <span style={`width: ${(Math.min(step + 1, STEPS.length) / STEPS.length) * 100}%`}></span>
    </div>
    <p class="step-no">
      {#if step < STEPS.length}<span class="visually-hidden">Question </span>{step + 1} of {STEPS.length}{:else}Your answers{/if}
    </p>
  </div>

  {#if step < STEPS.length}
    {@const s = STEPS[step]}
    <h2 tabindex="-1" bind:this={heading}>{s.question}</h2>
    {#if s.help}<p class="help">{s.help}</p>{/if}

    <!-- longer lists take two columns on wide screens -->
    <div class="answers" class:two={["days", "hard", "sleep"].includes(s.id)}>
      {#if s.id === "when"}
        <div class="months" role="group" aria-label="Months">
          {#each MONTHS as m, i}
            <button
              type="button"
              class="month"
              aria-pressed={f.months.includes(i + 1)}
              disabled={!f.months.includes(i + 1) && countWith({ months: [i + 1] }) === 0}
              title={!f.months.includes(i + 1) && countWith({ months: [i + 1] }) === 0 ? "No trail is in season then" : undefined}
              onclick={() => (f.months = toggle(f.months, i + 1))}
            >
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
        {@render option({ label: "Anywhere", set: { where: [] } })}
        {#each places as p}
          {@render place(p.continent, `Anywhere in ${p.continent}`)}
          <div class="countries">
            {#each p.countries as c}
              {@render place(c, c, true, f.where.includes(p.continent))}
            {/each}
          </div>
        {/each}
      {:else if s.id === "sleep"}
        {#each sleepingOptions as c}
          <button
            type="button"
            class="option"
            aria-pressed={f.sleep.includes(c.id)}
            disabled={!f.sleep.includes(c.id) && countWith({ sleep: [...f.sleep, c.id] }) === 0}
            onclick={() => (f.sleep = toggle(f.sleep, c.id))}
          >
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

    <!-- the pinned bar: Back, the count so far and Next stay in one place on every question -->
    <div class="nav">
      {#if step > 0}<button type="button" class="back" onclick={() => history.back()}>← Back</button>{/if}
      <p class="status" role="status">
        {#if total === 0}
          <strong>No trail matches</strong> all your answers so far.
        {:else}
          <strong>{trailsWord(total)}</strong> {total === 1 ? "matches" : "match"} your answers so far.
        {/if}
      </p>
      <button type="button" class="next" onclick={() => go(step + 1)}>
        {answered(s.id) ? (step === STEPS.length - 1 ? "See the result" : "Next") : "Skip"}
      </button>
    </div>
  {:else}
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

<!-- a continent or country, several at once (src/lib/filters.ts toggleWhere); "included": covered by a chosen continent -->
{#snippet place(value: string, label: string, small = false, included = false)}
  {@const on = f.where.includes(value)}
  {@const n = countWith({ where: on ? f.where : toggleWhere(f.where, value, places) })}
  <button
    type="button"
    class="option"
    class:small
    class:included
    aria-pressed={on}
    disabled={!on && n === 0}
    onclick={() => (f.where = toggleWhere(f.where, value, places))}
  >
    <span class="label">{label}</span>
    <span class="count">{trailsWord(n)}</span>
  </button>
{/snippet}

{#snippet option(o: Option, small = false)}
  <!-- an answer that would leave no trail can't be picked (unless it's the current one, to undo it) -->
  <button
    type="button"
    class="option"
    class:small
    aria-pressed={isSet(o.set)}
    disabled={!isSet(o.set) && countWith(o.set) === 0}
    onclick={() => Object.assign(f, o.set)}
  >
    <span class="label">{o.label}{#if o.sub}<span class="sub">{o.sub}</span>{/if}</span>
    <span class="count">{trailsWord(countWith(o.set))}</span>
  </button>
{/snippet}

<style>
  /* the guide fills the screen below the title (--top, set by the script) and its bar sits at the
     bottom; the site footer comes after it */
  .guide {
    display: flex;
    flex-direction: column;
    max-width: 820px;
    min-height: calc(100dvh - var(--top, 170px));
    margin: 0 auto;
  }
  .intro {
    max-width: 52ch;
    margin: -8px auto 16px;
    color: var(--muted);
    text-align: center;
  }
  .steps {
    display: flex;
    flex: none;
    align-items: center;
    gap: 12px;
    margin-bottom: 14px;
  }
  .progress {
    flex: 1;
    height: 4px;
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
    flex: none;
    margin: 0;
    color: var(--muted);
    font-size: 0.85rem;
    font-variant-numeric: tabular-nums;
  }
  h2 {
    margin: 2px 0 6px;
    font-size: clamp(1.4rem, 3.5vw, 1.8rem);
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
    margin-top: 14px;
  }
  @media (min-width: 900px) {
    .answers.two {
      grid-template-columns: 1fr 1fr;
      gap: 6px;
    }
    /* an odd last answer ("any") spans both columns */
    .answers.two > :last-child:nth-child(odd) {
      grid-column: 1 / -1;
    }
    /* the count moves up beside the title, so the description gets the card's full width */
    .answers.two .option {
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: baseline;
      align-content: start;
      gap: 2px 16px;
      padding-block: 8px;
    }
    .answers.two .label {
      display: contents;
    }
    .answers.two .sub {
      grid-column: 1 / -1;
      grid-row: 2;
    }
    .answers.two .count {
      grid-column: 2;
      grid-row: 1;
    }
  }
  .option {
    display: flex;
    min-width: 0;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 10px 16px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--bg);
    color: var(--text);
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition: border-color 0.15s ease;
  }
  .option:hover:not(:disabled),
  .month:hover:not(:disabled) {
    border-color: var(--muted);
  }
  .option:disabled,
  .month:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .option[aria-pressed="true"] {
    border-color: var(--accent);
    box-shadow: inset 0 0 0 1px var(--accent);
    background: var(--accent-soft);
  }
  .option.small {
    padding: 10px 14px;
  }
  .option.included {
    border-color: color-mix(in srgb, var(--accent) 45%, var(--line));
    background: color-mix(in srgb, var(--accent-soft) 50%, var(--bg));
  }
  .label {
    display: grid;
    gap: 2px;
    min-width: 0;
    font-weight: 600;
    overflow-wrap: anywhere;
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
  /* a continent's countries, indented beneath it; columns shrink to the space there is */
  .countries {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 180px), 1fr));
    gap: 8px;
    margin-left: 16px;
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
    padding: 12px 0;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--bg);
    color: var(--text);
    font: 600 1rem var(--sans);
    cursor: pointer;
  }
  .month[aria-pressed="true"] {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--bg);
  }
  .status {
    grid-area: status;
    margin: 0;
    color: var(--muted);
    font-size: 0.95rem;
    text-align: center;
  }
  .status strong {
    color: var(--text);
  }
  /* pinned to the bottom of the screen: pushed there by the guide's height, and sticky when the
     answers are longer than the screen. Phones put the count above the buttons, so the buttons
     keep their place however long it is. */
  .nav {
    position: sticky;
    bottom: 0;
    z-index: 1;
    display: grid;
    grid-template-areas: "back status next";
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 8px 16px;
    margin: auto 0 0;
    padding: 12px 0 calc(12px + env(safe-area-inset-bottom));
    border-top: 1px solid var(--line);
    background: var(--bg);
  }
  @media (max-width: 639px) {
    .nav {
      grid-template-areas: "status status" "back next";
      grid-template-columns: 1fr 1fr;
      align-items: end;
      margin-inline: -16px;
      padding-inline: 16px;
    }
  }
  .guide > :nth-last-child(2) {
    margin-bottom: 16px;
  }
  .back {
    grid-area: back;
    justify-self: start;
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
    grid-area: next;
    justify-self: end;
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
    margin: 16px 0 0;
    border-top: 1px solid var(--text);
  }
  .summary > div {
    padding: 8px 0;
    border-bottom: 1px solid var(--line);
  }
  /* wide screens: question and answer on one line, so the summary fits a laptop screen */
  @media (min-width: 640px) {
    .summary > div {
      display: grid;
      grid-template-columns: 2fr 3fr;
      align-items: baseline;
      gap: 16px;
    }
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
