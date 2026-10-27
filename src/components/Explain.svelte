<script lang="ts">
  // Explain.astro for Svelte islands: the same term button and popover (no JavaScript of its own;
  // closes with Esc, a click outside or Close). Keep the two in step.
  import type { Snippet } from "svelte";

  let { id, term, title = term, children }: { id: string; term: string; title?: string; children: Snippet } = $props();
</script>

<button class="term" type="button" popovertarget={id}>{term}</button>
<div {id} class="pop" popover="auto">
  <p class="pop-title">{title}</p>
  <div class="pop-text">{@render children()}</div>
  <p class="pop-foot">
    <button type="button" popovertarget={id} popovertargetaction="hide">Close</button>
  </p>
</div>

<style>
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
    color: var(--accent);
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
