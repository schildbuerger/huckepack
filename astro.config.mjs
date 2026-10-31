import { defineConfig } from "astro/config";
import svelte from "@astrojs/svelte";

export default defineConfig({
  // deployed to GitHub Pages under the custom domain, at the root (.github/workflows/deploy.yml)
  site: "https://huckepack.me",
  integrations: [svelte()],
  // scope component styles with a class rather than a data-astro-cid-* attribute: the same
  // specificity (one class equals one attribute selector), far less markup on the long trail pages
  scopedStyleStrategy: "class",
  // Content Security Policy as a <meta> tag (GitHub Pages can't send headers): Astro hashes every
  // script it renders; styles may be inline (the charts set style attributes); the maps fetch
  // OpenFreeMap's styles and tiles and the AWS terrain tiles, and start workers from blob: URLs
  // (maplibre-contour) and their own file. frame-ancestors can't be set in a <meta> tag.
  security: {
    csp: {
      directives: [
        "default-src 'self'",
        "img-src 'self' data: blob:",
        "font-src 'self'",
        "connect-src 'self' https://tiles.openfreemap.org https://s3.amazonaws.com",
        "worker-src 'self' blob:",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ],
      scriptDirective: { resources: ["'self'"] },
      styleDirective: { resources: ["'self'", "'unsafe-inline'"] },
    },
  },
  vite: {
    // maplibre-gl is one ~1 MB chunk, loaded only when a map scrolls into view
    build: { chunkSizeWarningLimit: 1100 },
    // The project lives in a cloud-synced Proton Drive folder, where file change events
    // don't reliably arrive; poll so the dev server sees new and changed files.
    server: { watch: { usePolling: true, interval: 500 } },
  },
});
