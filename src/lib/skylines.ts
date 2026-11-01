// Handcrafted skylines behind each trail page's title (issue #142): the mountains a trail is known for,
// drawn by hand in flat shapes (public photographs as reference only, nothing traced), in a 1600 × 320
// box with the ground at its foot; the massif slopes down to the ground at both ends, so the drawing
// flows into the band's ground instead of ending in a cut. The trail's own elevation profile is drawn
// in front of them by the page (TrailSkyline.astro), so the nearest ridge is always the trail's real line.
//
// massif: the far mountains as one polygon ("x,y x,y …"); snow: snowfields and glaciers over it;
// summits: named tops, for the panorama board's labels (names only: a height would be a figure, and
// every figure needs its source); landmarks: small flat drawings at their place (a cable car station,
// a hut); hut: where a mountain hut stands in the meadow.
export interface Skyline {
  view: string; // where the drawing is seen from, for the record and the screen-reader-free caption
  massif: string;
  snow: string[];
  summits: { name: string; x: number; y: number; side?: "left" | "right" }[];
  station?: { x: number; y: number; valley: [number, number] }; // a summit station and its cable car's foot
  hut?: { x: number; y: number };
}

export const SKYLINES: Record<string, Skyline> = {
  // the Mont Blanc massif from the Brévent, above Chamonix on the trail, looking south-east across the
  // valley: Aiguille Verte and the Drus on the left, the Aiguilles de Chamonix, the Aiguille du Midi with
  // its station, Mont Blanc du Tacul, Mont Maudit, the dome of Mont Blanc with the Bossons glacier
  // reaching down to the valley, the Dôme du Goûter and the sharp Aiguille de Bionnassay on the right
  "tour-du-mont-blanc": {
    view: "The Mont Blanc massif seen from the Brévent above Chamonix",
    massif:
      "0,320 60,304 110,272 140,226 158,170 170,122 185,118 200,124 222,150 238,136 244,132 250,144 270,168 300,180 330,172 360,180 390,190 420,188 438,156 450,180 466,148 480,176 496,140 512,170 530,152 548,182 572,168 596,114 602,104 608,104 614,116 640,136 680,112 720,98 752,106 790,94 815,87 842,96 880,86 920,76 955,71 995,74 1040,82 1080,92 1110,97 1150,92 1188,102 1228,124 1250,122 1290,132 1325,106 1340,97 1352,100 1380,136 1430,168 1490,212 1540,252 1580,292 1600,320",
    snow: [
      // Mont Blanc du Tacul to the Aiguille de Bionnassay, with the Bossons glacier
      "668,120 680,112 720,98 752,106 790,94 815,87 842,96 880,86 920,76 955,71 995,74 1040,82 1080,92 1110,97 1150,92 1188,102 1228,124 1250,122 1290,132 1325,106 1340,97 1352,100 1372,126 1340,132 1300,144 1250,140 1215,138 1180,136 1140,134 1100,142 1060,136 1020,152 990,158 978,200 968,252 958,254 950,200 940,156 905,144 870,140 840,136 810,140 775,136 740,144 705,142 680,136",
      // Aiguille Verte
      "160,136 170,122 185,118 200,124 214,140 196,144 182,140 170,144",
    ],
    summits: [
      { name: "Aiguille Verte", x: 185, y: 118, side: "left" },
      { name: "Les Drus", x: 244, y: 132, side: "right" },
      { name: "Aiguille du Midi", x: 605, y: 104, side: "left" },
      { name: "Mont Blanc du Tacul", x: 720, y: 98, side: "left" },
      { name: "Mont Maudit", x: 815, y: 87 },
      { name: "Mont Blanc", x: 955, y: 71 },
      { name: "Dôme du Goûter", x: 1150, y: 92 },
      { name: "Aiguille de Bionnassay", x: 1340, y: 97, side: "right" },
    ],
    station: { x: 605, y: 104, valley: [470, 300] },
    hut: { x: 1180, y: 286 },
  },
};
