// Rank scale shared by the HTML map and the terminal preview (same tones as geogridapi.io).
export const RANK_TONES = [
  { key: "top", max: 3, label: "1–3", fill: "#34b86f", ink: "#04210f" },
  { key: "mid", max: 10, label: "4–10", fill: "#f2b33d", ink: "#2b1a00" },
  { key: "low", max: 20, label: "11–20", fill: "#ee6a3c", ink: "#2a0b00" },
];

export const MISS_TONE = { key: "out", max: null, label: "Not in top 20", fill: "#d6d8de", ink: "#3d4250" };

/** Tone of a Google Maps position; null (or anything past 20) means not in the top 20. */
export function rankTone(rank) {
  if (!Number.isFinite(rank) || rank < 1) return MISS_TONE;
  return RANK_TONES.find((tone) => rank <= tone.max) ?? MISS_TONE;
}

export function hexToRgb(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** Competitors that rank ahead somewhere, most often ahead first. */
export function competitorsAhead(grid, limit) {
  return (grid.competitors ?? [])
    .filter((competitor) => competitor.ahead_points > 0)
    .sort((a, b) => b.ahead_points - a.ahead_points)
    .slice(0, limit);
}
