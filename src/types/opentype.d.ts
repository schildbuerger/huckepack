// The part of opentype.js (2.0, no bundled types) that src/lib/og-image.ts uses.
declare module "opentype.js" {
  interface Glyph {
    index: number;
  }
  interface Path {
    commands: { type: string; x?: number; y?: number; x1?: number; y1?: number; x2?: number; y2?: number }[];
  }
  interface Font {
    charToGlyph(char: string): Glyph;
    getAdvanceWidth(text: string, fontSize: number): number;
    getPath(text: string, x: number, y: number, fontSize: number): Path;
  }
  const opentype: { parse(buffer: ArrayBuffer): Font };
  export default opentype;
}
