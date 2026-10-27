<script lang="ts">
  // A slider over a fixed list of stops, for the search filters: one thumb (`hi` only), or two
  // (`lo` and `hi`, a range). Values are stop indexes. Built from native range inputs, so keyboard
  // and screen readers work as usual; two inputs stacked on one track make the range.
  let {
    stops,
    lo = $bindable(),
    hi = $bindable(),
    label,
    fill = "below",
    ticks = stops.map((_, i) => i),
    off,
  }: {
    stops: string[]; // the label of each stop, read out by screen readers
    lo?: number;
    hi: number;
    label: string;
    fill?: "below" | "above"; // single thumb: shade the part the filter keeps
    ticks?: number[]; // stops labelled under the track
    off?: number; // single thumb: the stop where the filter keeps everything ("Any"): no fill there
  } = $props();

  const last = stops.length - 1;
  const pct = (i: number) => (i / last) * 100;
  let dual = $derived(lo !== undefined);
  let from = $derived(dual ? pct(lo!) : fill === "below" ? 0 : pct(hi));
  let to = $derived(dual || fill === "below" ? pct(hi) : 100);
  // nothing filtered: an empty track, so the slider doesn't look switched on
  let idle = $derived(dual ? lo === 0 && hi === last : hi === off);

  function setLo(e: Event & { currentTarget: HTMLInputElement }) {
    lo = Math.min(Number(e.currentTarget.value), hi);
    e.currentTarget.value = String(lo);
  }
  function setHi(e: Event & { currentTarget: HTMLInputElement }) {
    hi = dual ? Math.max(Number(e.currentTarget.value), lo!) : Number(e.currentTarget.value);
    e.currentTarget.value = String(hi);
  }
</script>

<div class="range">
  <div class="rail">
    <div class="track"><span class="fill" class:idle style={`left: ${from}%; right: ${100 - to}%`}></span></div>
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
