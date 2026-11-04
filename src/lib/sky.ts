// The sky by the hour (the home page's hero, 2026-11-01; the trail pages' skylines, issue #142): the
// visitor's clock sets <html data-sky> to dawn (5–8), day (8–17), dusk (17–21) or night (21–5), and
// --sun-x / --sun-y place the sun (or the moon) on its arc across a band. Run as an inline script
// before the first paint (register it with inlineScript() in the page's frontmatter, for the CSP), so
// the sky never changes in front of the visitor; without JavaScript the bands show the day sky. In
// dark mode the sky is always night (issue #209): the clock's sky is kept in data-sky-clock, and the
// sun or moon's switch (Base.astro) sets data-sky to night or back to the clock's
export const SKY_SCRIPT = `(() => {
  const root = document.documentElement;
  const hour = new Date().getHours();
  root.dataset.skyClock = hour >= 21 || hour < 5 ? "night" : hour < 8 ? "dawn" : hour < 17 ? "day" : "dusk";
  root.dataset.sky = root.dataset.theme === "dark" ? "night" : root.dataset.skyClock;
  // 0 at sunrise on the left, 1 at sunset on the right (the moon the same through the night)
  const f = hour >= 5 && hour < 21 ? (hour - 5) / 16 : ((hour + 3) % 24) / 8;
  root.style.setProperty("--sun-x", (8 + f * 84).toFixed(1) + "%");
  root.style.setProperty("--sun-y", (14 + Math.pow(2 * f - 1, 2) * 46).toFixed(1) + "%");
})();`;

// the sky's flat colours, fixed rather than the theme's, since they show the time of day
export const SKY = { dawn: "#f2d8c2", day: "#d9e8e1", dusk: "#e7c0a2", night: "#1d2733" };
