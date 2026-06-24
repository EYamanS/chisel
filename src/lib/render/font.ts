// A minimal 5x7 bitmap font, just the glyphs needed for the view labels
// (FRONT / SIDE / TOP / ISO). Lets the rendered composite label its own panels
// without any canvas/text dependency.

const GLYPHS: Record<string, string[]> = {
  F: ["#####", "#    ", "#    ", "#### ", "#    ", "#    ", "#    "],
  R: ["#### ", "#   #", "#   #", "#### ", "# #  ", "#  # ", "#   #"],
  O: [" ### ", "#   #", "#   #", "#   #", "#   #", "#   #", " ### "],
  N: ["#   #", "##  #", "# # #", "# # #", "#  ##", "#   #", "#   #"],
  T: ["#####", "  #  ", "  #  ", "  #  ", "  #  ", "  #  ", "  #  "],
  S: [" ####", "#    ", "#    ", " ### ", "    #", "    #", "#### "],
  I: ["#####", "  #  ", "  #  ", "  #  ", "  #  ", "  #  ", "#####"],
  D: ["#### ", "#   #", "#   #", "#   #", "#   #", "#   #", "#### "],
  E: ["#####", "#    ", "#    ", "#### ", "#    ", "#    ", "#####"],
  P: ["#### ", "#   #", "#   #", "#### ", "#    ", "#    ", "#    "],
  " ": ["     ", "     ", "     ", "     ", "     ", "     ", "     "],
};

const GLYPH_W = 5;
const GLYPH_H = 7;

export function labelWidth(text: string, scale: number): number {
  return text.length * (GLYPH_W + 1) * scale;
}

/** Paint `text` into an RGB buffer at (x,y), top-left origin. */
export function drawLabel(
  buf: Uint8Array,
  imgW: number,
  imgH: number,
  x: number,
  y: number,
  text: string,
  scale = 2,
  rgb: [number, number, number] = [235, 243, 255]
) {
  let cx = x;
  for (const ch of text.toUpperCase()) {
    const g = GLYPHS[ch] ?? GLYPHS[" "];
    for (let ry = 0; ry < GLYPH_H; ry++) {
      for (let rx = 0; rx < GLYPH_W; rx++) {
        if (g[ry][rx] !== "#") continue;
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) {
            const px = cx + rx * scale + sx;
            const py = y + ry * scale + sy;
            if (px < 0 || py < 0 || px >= imgW || py >= imgH) continue;
            const i = (py * imgW + px) * 3;
            buf[i] = rgb[0];
            buf[i + 1] = rgb[1];
            buf[i + 2] = rgb[2];
          }
        }
      }
    }
    cx += (GLYPH_W + 1) * scale;
  }
}
