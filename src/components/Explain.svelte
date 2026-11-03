<script lang="ts">
  // Explain.astro for Svelte islands: the same term button and popover (no JavaScript of its own;
  // closes with Esc, a click outside or Close). Keep the two in step.
  import type { Snippet } from "svelte";

  // with `icon`, an (i) button instead of the term (the term is its accessible name), for charts
  let {
    id,
    term,
    title = term,
    icon = false,
    children,
  }: { id: string; term: string; title?: string; icon?: boolean; children: Snippet } = $props();
</script>

{#if icon}
  <button class="term icon" type="button" popovertarget={id} aria-label={term} title={term}>
    <svg class="info" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5" /><path d="M12 16.5v-5.5M12 7.6v.1" /></svg>
  </button>
{:else}
  <button class="term" type="button" popovertarget={id}>{term}</button>
{/if}
<div {id} class="pop" popover="auto">
  <p class="pop-title">{title}</p>
  <div class="pop-text">{@render children()}</div>
  <p class="pop-foot">
    <button type="button" popovertarget={id} popovertargetaction="hide">Close</button>
  </p>
</div>

<style>
  /* icon: an (i) button for what explains a chart (sources, method), so the page shows no caption
     lines; the term is its accessible name */
  .term.icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    margin: -5px;
    border-radius: 50%;
    color: var(--muted);
    text-decoration: none;
    cursor: pointer;
  }
  .term {
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    letter-spacing: inherit;
    text-align: inherit;
    text-transform: inherit;
    text-decoration: underline dotted;
    text-decoration-color: var(--muted);
    text-underline-offset: 3px;
    cursor: help;
  }
  .term:hover,
  .term:focus-visible {
    color: var(--accent-text);
    text-decoration-color: var(--accent);
  }
  .term:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
    border-radius: 2px;
  }
  .pop {
    width: min(440px, calc(100vw - 32px));
    padding: 20px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--bg);
    color: var(--text);
    box-shadow: 0 12px 40px rgb(0 0 0 / 0.18);
    font: 400 0.9rem/1.55 var(--sans);
    letter-spacing: normal;
    text-align: left;
    text-transform: none;
  }
  .pop::backdrop {
    background: rgb(0 0 0 / 0.25);
  }
  .pop p {
    margin: 0 0 12px;
  }
  .pop-title {
    font-family: var(--serif);
    font-size: 1.2rem;
    font-weight: 600;
    line-height: 1.3;
  }
  /* the box's content (issue #205): fact rows, a short label beside each value, and rating scales as
     cells with this trail's band marked. Its own rules win over those of where the term sits (a key
     figure's dt and dd are reordered and kept on one line there) */
  .pop-text :global(.pop-facts) {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    gap: 7px 14px;
    margin: 0 0 10px;
    line-height: 1.45;
  }
  .pop-text :global(.pop-facts dt),
  .pop-text :global(.pop-facts dd) {
    order: 0;
    display: block;
    min-width: 0;
    margin: 0;
    font-size: inherit;
    white-space: normal;
    text-align: left;
    text-transform: none;
    letter-spacing: normal;
  }
  .pop-text :global(.pop-facts dt) {
    max-width: 8.5em;
    padding-top: 1px;
    color: var(--muted);
    font-size: 0.8rem;
    font-weight: 500;
  }
  .pop-text :global(.pop-facts dd) {
    color: var(--text);
    font-weight: 400;
  }
  .pop-text :global(.pop-note) {
    display: block;
    color: var(--muted);
    font-size: 0.82rem;
  }
  .pop-text :global(.pop-scale) {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
    gap: 2px;
    margin: 4px 0 0;
    padding: 0;
    list-style: none;
    font-size: 0.8rem;
    line-height: 1.35;
  }
  .pop-text :global(.pop-scale li) {
    padding: 4px 6px;
    border-radius: 6px;
    color: var(--muted);
  }
  .pop-text :global(.pop-scale li span) {
    display: block;
    color: var(--text);
    font-weight: 600;
  }
  .pop-text :global(.pop-scale li.current) {
    background: var(--accent-soft);
    color: var(--text);
  }
  /* a scale whose bands are described in words (the SAC grades): rows, this trail's marked */
  .pop-text :global(.pop-grades dt.current),
  .pop-text :global(.pop-grades dd.current) {
    color: var(--text);
    font-weight: 600;
  }
  .pop-text :global(.pop-grades dt.current) {
    box-shadow: inset 3px 0 0 var(--accent);
    padding-left: 8px;
  }
  .pop-text {
    margin-bottom: 16px;
  }
  .pop-text :global(p) {
    margin: 0 0 8px;
  }
  .pop-text :global(dl) {
    margin: 0 0 8px;
  }
  .pop-text :global(dt) {
    font-weight: 600;
  }
  .pop-text :global(dd) {
    margin: 0 0 8px;
    color: var(--muted);
  }
  .pop-foot {
    display: flex;
    justify-content: flex-end;
    margin: 0 !important;
    font-size: 0.8rem;
  }
  .pop-foot button {
    padding: 6px 14px;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: none;
    color: var(--text);
    font: inherit;
    cursor: pointer;
  }
</style>
