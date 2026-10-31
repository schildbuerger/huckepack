// The basemap and theme handling both maps share (TrailMap on a trail page, TrailsMap on the trail
// map): OpenFreeMap's styles for the site's light and dark theme, the theme in effect, the colour
// tokens, and a watcher that calls back when the theme changes (the header switch sets
// <html data-theme>; auto follows the system setting).

export const STYLES = {
  light: "https://tiles.openfreemap.org/styles/liberty",
  dark: "https://tiles.openfreemap.org/styles/dark",
};
export type Theme = keyof typeof STYLES;

export const currentTheme = (): Theme => {
  const chosen = document.documentElement.dataset.theme;
  if (chosen === "light" || chosen === "dark") return chosen;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

// the basemap for an overview of trails (the trail map): the theme's style without the layers such a
// map doesn't need (points of interest, buildings, house numbers, airports), which halved its
// main-thread work in light mode (issue #86); the trail pages keep the full style
const OVERVIEW_DROP = new Set(["poi", "building", "housenumber", "aeroway", "aerodrome_label"]);
export async function overviewStyle(theme: Theme) {
  const style = await fetch(STYLES[theme]).then((r) => {
    if (!r.ok) throw new Error(`basemap style: HTTP ${r.status}`);
    return r.json();
  });
  style.layers = style.layers.filter((l: { "source-layer"?: string }) => !OVERVIEW_DROP.has(l["source-layer"] ?? ""));
  return style;
}

// a colour token from Base.astro, as the theme in effect sets it
export const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// MapLibre's stylesheet, added to the page when a map starts rather than linked in its head, where
// it held back the first paint of every page with a map (71 KB; PageSpeed, issue #86). Imported as a
// URL so Astro doesn't hoist it into the head; resolves once loaded, so the map is made styled
let maplibreCss: Promise<void> | undefined;
export function loadMaplibreCss(href: string): Promise<void> {
  maplibreCss ??= new Promise((resolve, reject) => {
    const link = Object.assign(document.createElement("link"), { rel: "stylesheet", href });
    link.onload = () => resolve();
    link.onerror = () => reject(new Error(`stylesheet ${href} failed to load`));
    document.head.append(link);
  });
  return maplibreCss;
}

// calls onChange(theme) whenever the theme in effect changes; returns a function that stops watching
export function watchTheme(onChange: (theme: Theme) => void): () => void {
  let theme = currentTheme();
  const check = () => {
    const next = currentTheme();
    if (next === theme) return;
    theme = next;
    onChange(theme);
  };
  const observer = new MutationObserver(check);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const system = matchMedia("(prefers-color-scheme: dark)");
  system.addEventListener("change", check);
  return () => {
    observer.disconnect();
    system.removeEventListener("change", check);
  };
}
