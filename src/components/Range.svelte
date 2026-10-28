<script lang="ts">
  // A slider over a fixed list of stops, for the search filters: one thumb (`hi` only), or two
  // (`lo` and `hi`, a range). Values are stop indexes. Built from native range inputs, so keyboard
  // and screen readers work as usual; two inputs stacked on one track make the range. Stops that
  // `live` (and `liveLo` for the lower thumb) mark false would leave no trail: the track shows them
  // dashed and a thumb won't move onto them, except back to where it already is.
  let {
    stops,
    lo = $bindable(),
    hi = $bindable(),
    label,
    fill = "below",
    ticks = stops.map((_, i) => i),
    off,
    live,
    liveLo,
  }: {
    stops: string[]; // the label of each stop, read out by screen readers
    lo?: number;
    hi: number;
    label: string;
    fill?: "below" | "above"; // single thumb: shade the part the filter keeps
    ticks?: number[]; // stops labelled under the track
    off?: number; // single thumb: the stop where the filter keeps everything ("Any"): no fill there
    live?: boolean[]; // per stop: may the (upper) thumb go there
    liveLo?: boolean[]; // per stop: may the lower thumb go there
  } = $props();

  const last = stops.length - 1;
  const pct = (i: number) => (i / last) * 100;
  let dual = $derived(lo !== undefined);
  let from = $derived(dual ? pct(lo!) : fill === "below" ? 0 : pct(hi));
  let to = $derived(dual || fill === "below" ? pct(hi) : 100);
  // nothing filtered: an empty track, so the slider doesn't look switched on
  let idle = $derived(dual ? lo === 0 && hi === last : hi === off);

  // the stop nearest v on the way back to the thumb's current stop that it may go to
  const allowed = (v: number, cur: number, ok?: boolean[]) => {
    while (ok && v !== cur && !ok[v]) v += v > cur ? -1 : 1;
    return v;
  };
  // the dead stops as runs along the track, each reaching halfway to its live neighbours
  let dead = $derived.by(() => {
    const isDead = stops.map((_, i) => (live && !live[i]) || (liveLo && !liveLo[i]));
    const runs: [number, number][] = [];
    isDead.forEach((d, i) => {
      if (!d) return;
      if (runs.length && runs.at(-1)![1] === i - 1) runs.at(-1)![1] = i;
      else runs.push([i, i]);
    });
    return runs.map(([a, b]) => [pct(Math.max(a - 0.5, 0)), pct(Math.min(b + 0.5, last))]);
  });

  function setLo(e: Event & { currentTarget: HTMLInputElement }) {
    lo = allowed(Math.min(Number(e.currentTarget.value), hi), lo!, liveLo);
    e.currentTarget.value = String(lo);
  }
  function setHi(e: Event & { currentTarget: HTMLInputElement }) {
    hi = allowed(dual ? Math.max(Number(e.currentTarget.value), lo!) : Number(e.currentTarget.value), hi, live);
    e.currentTarget.value = String(hi);
  }
</script>

<div class="range">
  <div class="rail">
    <div class="track">
      <span class="fill" class:idle style={`left: ${from}%; right: ${100 - to}%`}></span>
      <!-- over the fill, so the dashes show inside the part the filter keeps too -->
      {#each dead as [a, b]}<span class="dead" style={`left: ${a}%; right: ${100 - b}%`}></span>{/each}
    </div>
    {#if dual}
      <!-- the lower thumb on top once it's past the middle, so two thumbs at the end can still be pulled apart -->
      <input
        type="range"
        min="0"
        max={last}
        step="1"
        value={lo}
        class:top={lo! > last / 2}
        aria-label={`${label}, from`}
        aria-valuetext={stops[lo!]}
        oninput={setLo}
      />
    {/if}
    <input
      type="range"
      min="0"
      max={last}
      step="1"
      value={hi}
      aria-label={dual ? `${label}, to` : label}
      aria-valuetext={stops[hi]}
      oninput={setHi}
    />
  </div>
  <div class="ticks" aria-hidden="true">
    {#each ticks as i}<span style={`left: ${pct(i)}%`} class:first={i === 0} class:end={i === last}>{stops[i]}</span>{/each}
  </div>
</div>

<style>
  .range {
    --thumb: 18px;
    padding: 0 calc(var(--thumb) / 2);
  }
  /* touch screens: a thumb a finger can find */
  @media (pointer: coarse) {
    .range {
      --thumb: 26px;
    }
  }
  .rail {
    position: relative;
    height: var(--thumb);
  }
  .track {
    position: absolute;
    top: 50%;
    right: 0;
    left: 0;
    height: 4px;
    margin-top: -2px;
    border-radius: 2px;
    background: var(--line);
  }
  .fill.idle {
    display: none;
  }
  /* stops that would leave no trail: the track breaks into dashes there */
  .dead {
    position: absolute;
    top: 0;
    bottom: 0;
    background: repeating-linear-gradient(90deg, var(--bg) 0 3px, transparent 3px 7px);
  }
  .fill {
    position: absolute;
    top: 0;
    bottom: 0;
    border-radius: 2px;
    background: var(--accent);
  }
  /* the inputs span the rail plus half a thumb each side, so a thumb's centre sits on its stop */
  input {
    position: absolute;
    top: 0;
    left: calc(var(--thumb) / -2);
    width: calc(100% + var(--thumb));
    height: var(--thumb);
    margin: 0;
    padding: 0;
    border: 0;
    background: none;
    appearance: none;
    pointer-events: none;
    outline: none;
  }
  input.top {
    z-index: 1;
  }
  input::-webkit-slider-runnable-track {
    height: var(--thumb);
    background: none;
  }
  input::-moz-range-track {
    background: none;
  }
  input::-webkit-slider-thumb {
    width: var(--thumb);
    height: var(--thumb);
    border: 2px solid var(--bg);
    border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
    appearance: none;
    cursor: grab;
    pointer-events: auto;
  }
  input::-moz-range-thumb {
    width: var(--thumb);
    height: var(--thumb);
    box-sizing: border-box;
    border: 2px solid var(--bg);
    border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
    cursor: grab;
    pointer-events: auto;
  }
  input:focus-visible::-webkit-slider-thumb {
    box-shadow: 0 0 0 1px var(--accent), 0 0 0 4px color-mix(in srgb, var(--accent) 35%, transparent);
  }
  input:focus-visible::-moz-range-thumb {
    box-shadow: 0 0 0 1px var(--accent), 0 0 0 4px color-mix(in srgb, var(--accent) 35%, transparent);
  }
  .ticks {
    position: relative;
    height: 1.2em;
    margin-top: 4px;
    color: var(--muted);
    font-size: 0.72rem;
  }
  .ticks span {
    position: absolute;
    transform: translateX(-50%);
    white-space: nowrap;
  }
  /* the end labels hang inside the column instead of centring past its edge */
  .ticks .first {
    transform: translateX(calc(var(--thumb) / -2));
  }
  .ticks .end {
    transform: translateX(calc(-100% + var(--thumb) / 2));
  }
</style>
