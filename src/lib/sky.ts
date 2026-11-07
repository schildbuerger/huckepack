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
  root.style.setProperty("--sun-f", f.toFixed(3));
  root.style.setProperty("--sun-x", (8 + f * 84).toFixed(1) + "%");
  root.style.setProperty("--sun-y", (14 + Math.pow(2 * f - 1, 2) * 46).toFixed(1) + "%");
})();`;

// The home page's sun (or moon) kept off the hero's words (2026-11-07, Baymard #290: at night the cream
// moon hid letters of the cream headline, at midday the sun sat on the eyebrow). The hour still sets
// its place on an arc across the band (--sun-f from SKY_SCRIPT: 0 at sunrise on the left, 1 at sunset
// on the right, highest at midday, down by the summits at either end); from the boxes of the words (the
// eyebrow's, the headline's and the link's lines, the trip search, the summit flags' numbers and labels,
// these widened by the flags' drift with the pointer) the sun takes the free place nearest that point,
// a whole sun's width clear of every word. Below the summits' line it may sink behind the ridges (they
// are drawn over it), costing twice as much distance, so on a phone, where the words fill the sky, it
// rises between the flags, or stands half past the band's edge. Sized for the sun (--sun-d: 110 px,
// 84 px on phones); the moon (70 px, 56 px) has the same centre, so a theme switch moves nothing. Run right after the flags, before the first paint, and again when the band's
// size changes. Without JavaScript the sun keeps SKY_SCRIPT's place.
export const HERO_SUN_SCRIPT = `(() => {
  const band = document.querySelector(".hero-band");
  const sun = band && band.querySelector(".hb-sun");
  const hero = band && band.querySelector(".hero");
  if (!sun || !hero) return;
  const PAD = 12, STEP = 8;
  const place = () => {
    const b = band.getBoundingClientRect();
    const W = b.width, H = b.height;
    if (!W || !H) return;
    const R = (parseFloat(getComputedStyle(sun).getPropertyValue("--sun-d")) || 110) / 2;
    const f = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--sun-f")) || 0.5;
    const boxes = [];
    const add = (r, px, py) => r.width && r.height && boxes.push([r.left - b.left - px, r.top - b.top - py, r.right - b.left + px, r.bottom - b.top + py]);
    for (const el of hero.querySelectorAll(".eyebrow, h1, .guide")) {
      const range = document.createRange();
      range.selectNodeContents(el);
      for (const r of range.getClientRects()) add(r, PAD, PAD);
    }
    for (const el of hero.querySelectorAll(".trip")) add(el.getBoundingClientRect(), PAD, PAD);
    // the flags drift by up to 2.2 % of the band's width with the pointer (their deepest ridge)
    for (const el of band.querySelectorAll(".hs .cloth")) add(el.getBoundingClientRect(), 8 + W * 0.025, 8);
    const clear = (x, y) => boxes.every(([l, t, r, bt]) => {
      const dx = Math.max(l - x, 0, x - r), dy = Math.max(t - y, 0, y - bt);
      return dx * dx + dy * dy >= R * R;
    });
    const x0 = R + 16, x1 = W - R - 16, top = R + 14, low = Math.max(top, H - 170), floor = H - 50;
    const ix = x0 + f * (x1 - x0), iy = top + Math.pow(2 * f - 1, 2) * (low - top);
    let best = [ix, iy], cost = Infinity;
    // where the words leave no room, the sun may stand half past the band's edge
    for (let y = top; y <= floor; y += STEP)
      for (let x = R * 0.5; x <= W - R * 0.5; x += STEP) {
        const dy = y > low ? (y - low) * 2 + (low - iy) : y - iy;
        const c = (x - ix) * (x - ix) + dy * dy;
        if (c < cost && clear(x, y)) [best, cost] = [[x, y], c];
      }
    sun.style.left = best[0].toFixed(0) + "px";
    sun.style.top = best[1].toFixed(0) + "px";
  };
  place();
  let w = 0, h = 0;
  new ResizeObserver(() => {
    const r = band.getBoundingClientRect();
    if (Math.abs(r.width - w) < 1 && Math.abs(r.height - h) < 1) return;
    [w, h] = [r.width, r.height];
    place();
  }).observe(band);
})();`;

// the sky's flat colours, fixed rather than the theme's, since they show the time of day
export const SKY = { dawn: "#f2d8c2", day: "#d9e8e1", dusk: "#e7c0a2", night: "#1d2733" };
