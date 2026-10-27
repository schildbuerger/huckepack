import { defineConfig } from "astro/config";
import svelte from "@astrojs/svelte";

export default defineConfig({
  integrations: [svelte()],
  vite: {
    // maplibre-gl is one ~1 MB chunk, loaded only when a map scrolls into view
    build: { chunkSizeWarningLimit: 1100 },
  },
});
