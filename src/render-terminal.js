import { competitorsAhead, hexToRgb, rankTone } from "./colors.js";

const RESET = "\x1b[0m";

function paint(text, tone, useColor) {
  if (!useColor) return text;
  const [br, bg, bb] = hexToRgb(tone.fill);
  const [fr, fg, fb] = hexToRgb(tone.ink);
  return `\x1b[48;2;${br};${bg};${bb}m\x1b[38;2;${fr};${fg};${fb}m${text}${RESET}`;
}

/** The ranks matrix as colored cells, north at the top. Cells outside the shape stay blank. */
export function renderRanks(grid, { useColor = true } = {}) {
  const measured = new Set((grid.points ?? []).map((point) => `${point.row}:${point.col}`));
  return grid.ranks
    .map((row, rowIndex) =>
      row
        .map((rank, colIndex) => {
          if (!measured.has(`${rowIndex}:${colIndex}`)) return "     ";
          const label = rank === null ? "20+" : String(rank);
          return paint(` ${label.padStart(3)} `, rankTone(rank), useColor);
        })
        .join(""),
    )
    .join("\n");
}

export function renderSummary(grid) {
  const { summary, points_total: total } = grid;
  const average = summary.average_rank === null ? "not in the top 20" : `${summary.average_rank.toFixed(1)} where found`;
  const lines = [
    `"${grid.keyword}" around ${grid.place?.name ?? "the listing"} (${grid.mode === "test" ? "test grid, sample data" : "live"})`,
    `Average rank ${average} · top 3 on ${summary.top3_points}/${total} points · found on ${summary.found_points}/${total}`,
  ];
  const ahead = competitorsAhead(grid, 3);
  if (ahead.length > 0) {
    lines.push("Ranking ahead most often:");
    for (const competitor of ahead) {
      lines.push(`  ${competitor.name}: ahead on ${competitor.ahead_points} points, #1 on ${competitor.first_points}`);
    }
  }
  return lines.join("\n");
}
