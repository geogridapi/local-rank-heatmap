import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { MISS_TONE, competitorsAhead, rankTone } from "../src/colors.js";
import { pointsToCsv } from "../src/csv.js";
import { pageData, renderHtml } from "../src/render-html.js";
import { renderRanks, renderSummary } from "../src/render-terminal.js";

const grid = JSON.parse(readFileSync(new URL("./fixture-grid.json", import.meta.url), "utf8"));

test("rank tones follow the 1–3 / 4–10 / 11–20 scale", () => {
  assert.equal(rankTone(1).key, "top");
  assert.equal(rankTone(3).key, "top");
  assert.equal(rankTone(4).key, "mid");
  assert.equal(rankTone(10).key, "mid");
  assert.equal(rankTone(11).key, "low");
  assert.equal(rankTone(20).key, "low");
  assert.equal(rankTone(21), MISS_TONE);
  assert.equal(rankTone(null), MISS_TONE);
});

test("the CSV has one quoted-safe line per point", () => {
  const csv = pointsToCsv(grid);
  const lines = csv.trim().split("\n");

  assert.ok(csv.startsWith("\uFEFF"), "starts with a UTF-8 byte order mark for Excel");
  assert.equal(lines.length, 1 + grid.points.length);
  assert.equal(lines[0], "row,col,lat,lng,rank,top1,top2,top3");
  assert.match(lines[1], /^0,0,40\.75,-73\.99,1,"Pizza, ""Best"" & Co",/);
  assert.match(lines[3], /^0,2,[^,]+,[^,]+,,/, "a miss leaves the rank empty");
});

test("names that look like formulas are neutralized in the CSV", () => {
  const hostile = {
    points: [{ row: 0, col: 0, lat: 1, lng: -2, rank: 3, top: [{ name: "=HYPERLINK(\"http://x\")" }, { name: "+1 Plomberie" }, { name: "@SUM(1)" }] }],
  };

  const line = pointsToCsv(hostile).trim().split("\n")[1];

  assert.equal(line, `0,0,1,-2,3,"'=HYPERLINK(""http://x"")",'+1 Plomberie,'@SUM(1)`);
});

test("competitors ahead are sorted by points ahead, never-ahead ones dropped", () => {
  const ranked = competitorsAhead({
    competitors: [
      { name: "A", ahead_points: 0 },
      { name: "B", ahead_points: 2 },
      { name: "C", ahead_points: 9 },
      { name: "D", ahead_points: 4 },
    ],
  }, 2);

  assert.deepEqual(ranked.map((competitor) => competitor.name), ["C", "D"]);
});

test("the terminal grid prints every rank, north row first", () => {
  const text = renderRanks(grid, { useColor: false });

  assert.deepEqual(text.split("\n"), ["   1    4  20+ ", "   2   12    5 ", "   3  20+   20 "]);
});

test("the summary names the competitors ranking ahead", () => {
  const text = renderSummary(grid);

  assert.match(text, /Average rank 6\.7 where found · top 3 on 3\/9 points · found on 7\/9/);
  assert.match(text, /Pizza, "Best" & Co: ahead on 5 points/);
  assert.doesNotMatch(text, /Third/, "competitors never ahead are left out");
});

test("the HTML page escapes names coming from Google", () => {
  const html = renderHtml(grid);

  assert.ok(!html.includes("</script><img"), "a name cannot close the data script");
  assert.ok(!html.includes("<b>NYC</b>"), "the title is escaped");
  assert.match(html, /\\u003c\/script\\u003e/);
  assert.match(html, /<title>“pizza” around Joe&#39;s Pizza &#60;b&#62;NYC&#60;\/b&#62;/);
});

test("the page data keeps only what the map needs", () => {
  const data = pageData(grid);

  assert.equal(data.points.length, 9);
  assert.deepEqual(Object.keys(data.points[0].top[0]), ["rank", "name"]);
  assert.equal(data.pointsTotal, 9);
  assert.equal(data.tones.at(-1).key, "out");
  assert.deepEqual(data.competitors.map((competitor) => competitor.name), ['Pizza, "Best" & Co']);
});
