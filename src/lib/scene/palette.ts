// A fixed, curated palette — same idea as the pixel-art engine: constraining the
// agent to a known set of colors keeps results coherent instead of a muddy mix.
export interface Swatch {
  name: string;
  hex: string;
}

export const PALETTE: Swatch[] = [
  { name: "charcoal", hex: "#2b2d33" },
  { name: "slate", hex: "#4a5568" },
  { name: "steel", hex: "#8a97a8" },
  { name: "silver", hex: "#c7ced6" },
  { name: "bone", hex: "#e8e2d4" },
  { name: "rust", hex: "#b5523a" },
  { name: "amber", hex: "#d99a30" },
  { name: "olive", hex: "#7c8a4a" },
  { name: "teal", hex: "#3a8a82" },
  { name: "denim", hex: "#3f6fa3" },
  { name: "plum", hex: "#7a4a78" },
  { name: "wood", hex: "#9c6b3f" },
];

export function palettePrompt(): string {
  return PALETTE.map((s) => `${s.name} (${s.hex})`).join(", ");
}

export function resolveColor(input: string | undefined, fallback = "#8a97a8"): string {
  if (!input) return fallback;
  const v = input.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  const named = PALETTE.find((s) => s.name === v);
  return named ? named.hex : fallback;
}
