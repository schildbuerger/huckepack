import { defineConfig } from "astro/config";
import svelte from "@astrojs/svelte";

export default defineConfig({
  // deployed to GitHub Pages under the custom domain, at the root (.github/workflows/deploy.yml)
  site: "https://huckepack.me",
  integrations: [svelte()],
  // scope component styles with a class rather than a data-astro-cid-* attribute: the same
  // specificity (one class equals one attribute selector), far less markup on the long trail pages
  scopedStyleStrategy: "class",
  vite: {
    // maplibre-gl is one ~1 MB chunk, loaded only when a map scrolls into view
    build: { chunkSizeWarningLimit: 1100 },
    // The project lives in a cloud-synced Proton Drive folder, where file change events
    // don't reliably arrive; poll so the dev server sees new and changed files.
    server: { watch: { usePolling: true, interval: 500 } },
  },
});
