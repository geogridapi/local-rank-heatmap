// A leading = + - @ (or tab, carriage return) makes spreadsheets run the cell as a formula.
const FORMULA_START = /^[=+\-@\t\r]/;

function cell(value) {
  if (value === null || value === undefined) return "";
  const text = typeof value === "string" && FORMULA_START.test(value) ? `'${value}` : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** One line per measured point: position, coordinates, rank and the top 3 listings there. */
export function pointsToCsv(grid) {
  const header = ["row", "col", "lat", "lng", "rank", "top1", "top2", "top3"];
  const lines = (grid.points ?? []).map((point) => {
    const names = [0, 1, 2].map((index) => point.top?.[index]?.name ?? "");
    return [point.row, point.col, point.lat, point.lng, point.rank, ...names].map(cell).join(",");
  });
  // The byte order mark tells Excel the file is UTF-8, so accented names stay readable.
  return `\uFEFF${[header.join(","), ...lines].join("\n")}\n`;
}
