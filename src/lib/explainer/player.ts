// The explainer's player (loaded only when a visitor presses play): fetches the film's data, draws the
// scene once (src/lib/explainer/film.ts, every changing attribute marked) and then, frame by frame, sets
// only the attributes whose value changed; swaps the hiker's stop-motion frames, shows the scene's
// caption, plays the optional sound, and offers pause, replay and the sound toggle.
import { DURATION, LAYOUTS, SCENES, WALK_UNTIL, film, state, type FilmData } from "./film";
import { FRAMES } from "./hiker";
import { Sound } from "./sound";

let data: Promise<FilmData> | undefined;
const sound = new Sound();

export async function play(root: HTMLElement) {
  const $ = <T extends Element>(s: string) => root.querySelector<T>(s)!;
  const stage = $<HTMLElement>(".ex-stage");
  const caption = $<HTMLElement>(".ex-caption");
  const pauseBtn = $<HTMLButtonElement>(".ex-pause"), replayBtn = $<HTMLButtonElement>(".ex-replay"), soundBtn = $<HTMLButtonElement>(".ex-sound");
  // the panels' titles, from the transcript
  const titles = [...root.querySelectorAll<HTMLElement>(".ex-transcript li b")].map((b) => b.textContent!.replace(/\.$/, ""));

  root.classList.add("loading");
  data ??= fetch("/explainer/film.json").then((r) => r.json());
  const d = await data;
  const L = LAYOUTS[matchMedia("(max-width: 640px)").matches ? "tall" : "wide"];
  stage.innerHTML = `<svg viewBox="0 0 ${L.W} ${L.H}" preserveAspectRatio="xMidYMax slice" aria-hidden="true">${film(d, L, state(d, L, 0), true)}</svg>`;
  root.classList.remove("loading");
  root.classList.add("playing");

  // the changing attributes (in the film and in the band behind it), and the hiker's frames
  const refs = [...root.querySelectorAll<SVGElement>("[data-d]")].flatMap((el) =>
    el.dataset.d!.split("|").map((p) => {
      const [attr, key] = p.split(":");
      return { el, attr, key, last: el.getAttribute(attr) };
    }),
  );
  // the stop-motion figures (the hiker, the dog): each a group of frames, the one shown by its state key
  const S0 = state(d, L, 0);
  const figures = [...stage.querySelectorAll<SVGGElement>("[data-fs]")].map((box) => {
    const key = box.dataset.fs!;
    const frames = new Map([...box.querySelectorAll<SVGGElement>(":scope > [data-f]")].map((g) => [g.dataset.f!, g]));
    return { key, frames, shown: frames.get(S0[key]), last: S0[key] };
  });

  let t = 0, last = performance.now(), playing = true, scene = -1, nextBird = 0.6, nextCricket = WALK_UNTIL + 0.8, lastFrame = "";
  // the title fades out, changes and fades in with each panel
  let swap = 0;
  const setScene = (i: number) => {
    const first = scene < 0;
    scene = i;
    // the last title (and its way on) moves to the middle while it is faded out
    const show = () => {
      caption.textContent = titles[scene] ?? "";
      root.classList.toggle("night", scene === SCENES.length - 1);
      caption.classList.remove("swap");
    };
    clearTimeout(swap);
    if (first) return show();
    caption.classList.add("swap");
    swap = window.setTimeout(show, 300);
  };
  const draw = () => {
    const S = state(d, L, t);
    for (const r of refs) {
      const v = S[r.key];
      if (v !== r.last) {
        r.el.setAttribute(r.attr, v);
        r.last = v;
      }
    }
    for (const f of figures) {
      if (S[f.key] === f.last) continue;
      f.last = S[f.key];
      const g = f.frames.get(f.last);
      if (g && g !== f.shown) {
        f.shown?.setAttribute("display", "none");
        g.removeAttribute("display");
        f.shown = g;
      }
    }
    if (S.hiker !== lastFrame) {
      // footfalls: the poses where a foot lands
      const n = Number(S.hiker.slice(1));
      if (S.hiker[0] === "w" && n % (FRAMES / 2) === 0) sound.step();
      lastFrame = S.hiker;
    }
    const i = SCENES.findLastIndex((s) => t >= s);
    if (i !== scene) setScene(i);
  };
  const tick = (now: number) => {
    if (!playing) return;
    t = Math.min(DURATION, t + (now - last) / 1000);
    last = now;
    if (t < 17 && t >= nextBird) {
      sound.bird();
      nextBird = t + 0.8 + Math.random() * 1.6;
    }
    if (t > WALK_UNTIL && t >= nextCricket) {
      sound.cricket();
      nextCricket = t + 0.45 + Math.random() * 0.3;
    }
    draw();
    if (t >= DURATION) return finish();
    requestAnimationFrame(tick);
  };
  const finish = () => {
    playing = false;
    root.classList.add("ended");
    pauseBtn.hidden = true;
    replayBtn.hidden = false;
  };
  const resume = () => {
    playing = true;
    last = performance.now();
    pauseBtn.setAttribute("aria-label", "Pause");
    pauseBtn.classList.remove("paused");
    requestAnimationFrame(tick);
  };

  pauseBtn.hidden = false;
  replayBtn.hidden = true;
  pauseBtn.onclick = () => {
    if (playing) {
      playing = false;
      pauseBtn.setAttribute("aria-label", "Play");
      pauseBtn.classList.add("paused");
    } else resume();
  };
  replayBtn.onclick = () => {
    t = 0;
    scene = -1;
    nextBird = 0.6;
    nextCricket = WALK_UNTIL + 0.8;
    root.classList.remove("ended");
    replayBtn.hidden = true;
    pauseBtn.hidden = false;
    resume();
  };
  soundBtn.onclick = () => {
    if (sound.on) sound.disable();
    else sound.enable();
    soundBtn.setAttribute("aria-pressed", String(sound.on));
  };
  soundBtn.setAttribute("aria-pressed", String(sound.on));
  draw();
  requestAnimationFrame((now) => {
    last = now;
    requestAnimationFrame(tick);
  });
}
