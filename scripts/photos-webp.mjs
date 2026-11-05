// pipeline/photos.py: one downloaded photo saved as WebP, 1,280 px wide (NN.webp) and 480 px (NN-s.webp,
// the mosaic's small tiles and the gallery's strip). Usage: node scripts/photos-webp.mjs <in.jpg> <out
// path without extension>. Prints the large copy's size as JSON.
import sharp from "sharp";

const [input, out] = process.argv.slice(2);
const big = await sharp(input).rotate().resize({ width: 1280, withoutEnlargement: true }).webp({ quality: 74 }).toFile(`${out}.webp`);
await sharp(input).rotate().resize({ width: 480 }).webp({ quality: 70 }).toFile(`${out}-s.webp`);
console.log(JSON.stringify({ w: big.width, h: big.height }));
