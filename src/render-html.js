import { MISS_TONE, RANK_TONES, competitorsAhead } from "./colors.js";

// MapLibre + OpenFreeMap: free vector tiles, no key, and they load from a file:// page.
const MAPLIBRE = {
  css: "https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/5.24.0/maplibre-gl.css",
  cssIntegrity: "sha512-KIMsMWIdnoG9OwZa+oaIafmbDonqck1UCmq+/zcUi2aaZ97N9QE6TqpTM+n36EO40HGh64hU/375zxtjx7WTyQ==",
  js: "https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/5.24.0/maplibre-gl.js",
  jsIntegrity: "sha512-rOFgoUgWaVi69JW1dzBu6PWF9xKW9rxYfY5u2SexFABHhWk0qUWkJoWNz4UuZRMvSXsNZG66+tU5B+HlwWF5kA==",
};
export const MAP_STYLE = "https://tiles.openfreemap.org/styles/positron";

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

/** JSON that is safe inside a <script> element. */
function scriptJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

/** Keeps only what the page needs from a grid object. */
export function pageData(grid) {
  return {
    keyword: grid.keyword,
    mode: grid.mode,
    place: grid.place,
    shape: grid.shape,
    size: grid.size,
    density: grid.density,
    radiusKm: grid.radius_km,
    pointsTotal: grid.points_total,
    summary: grid.summary,
    completedAt: grid.completed_at ?? grid.created_at,
    points: (grid.points ?? []).map(({ row, col, lat, lng, rank, top }) => ({
      row,
      col,
      lat,
      lng,
      rank,
      top: (top ?? []).slice(0, 3).map(({ rank: position, name }) => ({ rank: position, name })),
    })),
    competitors: competitorsAhead(grid, 5),
    tones: [...RANK_TONES, MISS_TONE],
    mapStyle: MAP_STYLE,
  };
}

/** A self-contained HTML page: an interactive map of the grid with its summary. */
export function renderHtml(grid) {
  const title = `“${grid.keyword}” around ${grid.place?.name ?? "the listing"} · Local rank heatmap`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="${MAPLIBRE.css}" integrity="${MAPLIBRE.cssIntegrity}" crossorigin="anonymous" referrerpolicy="no-referrer">
<style>${STYLES}</style>
</head>
<body>
<main class="layout">
  <aside class="panel" aria-labelledby="keyword">
    <p class="eyebrow">Local rank heatmap <span class="mode" id="mode"></span></p>
    <h1 id="keyword"></h1>
    <p class="place" id="place"></p>
    <p class="meta" id="meta"></p>
    <section class="stats" aria-label="Summary">
      <div class="stat stat-main"><span class="stat-value" id="avg"></span><span class="stat-label" id="avg-label">average rank where the listing appears</span></div>
      <div class="stat"><span class="stat-value" id="top3"></span><span class="stat-label">points in the top 3</span></div>
      <div class="stat"><span class="stat-value" id="found"></span><span class="stat-label">points in the top 20</span></div>
    </section>
    <ul class="legend" id="legend" aria-label="Rank colors"></ul>
    <section class="ahead" aria-labelledby="ahead-title">
      <h2 id="ahead-title">Ranking ahead most often</h2>
      <ol id="competitors"></ol>
    </section>
    <footer class="credit">Ranks are Google Maps positions at each point. Measured with <a href="https://geogridapi.io" rel="noopener">GeoGridAPI</a>, drawn by <a href="https://github.com/geogridapi/local-rank-heatmap" rel="noopener">local-rank-heatmap</a>.</footer>
  </aside>
  <div class="map" id="map" role="region" aria-label="Map of ranks"></div>
</main>
<script>window.GRID = ${scriptJson(pageData(grid))};</script>
<script src="${MAPLIBRE.js}" integrity="${MAPLIBRE.jsIntegrity}" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
<script>${CLIENT_SCRIPT}</script>
</body>
</html>
`;
}

const STYLES = `
:root {
  --bg: #f3f5fa; --surface: #ffffff; --border: #dbe1ee; --ink: #121826; --muted: #4a5163;
  --primary: #2f5bea; --primary-ink: #1d3fb3;
  --font-sans: "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; --font-display: "Plus Jakarta Sans", "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  --radius-lg: 18px; --radius-sm: 8px;
}
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; }
body { background: var(--bg); color: var(--ink); font: 15px/1.5 var(--font-sans); }
.layout { display: grid; grid-template-columns: minmax(320px, 380px) 1fr; height: 100vh; }
.panel { overflow-y: auto; padding: 28px 28px 20px; background: var(--surface); border-right: 1px solid var(--border); display: flex; flex-direction: column; gap: 18px; }
.eyebrow { margin: 0; font-size: 12px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--primary-ink); display: flex; gap: 8px; align-items: center; }
.mode { letter-spacing: .02em; text-transform: none; font-weight: 600; font-size: 11px; padding: 2px 8px; border-radius: 999px; background: #eaeef8; color: var(--muted); }
.mode.live { background: #e7f6ee; color: #047857; }
h1 { margin: -6px 0 0; font: 800 clamp(28px, 3.2vw, 38px)/1.1 var(--font-display); letter-spacing: -.02em; overflow-wrap: anywhere; }
.place { margin: -10px 0 0; font-weight: 600; }
.meta { margin: -14px 0 0; color: var(--muted); font-size: 13px; }
.stats { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.stat { border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 10px 12px; display: flex; flex-direction: column; }
.stat-main { grid-column: 1 / -1; background: #f7f9fe; border-color: #c9d4f3; padding: 14px 16px; }
.stat-value { font: 700 22px/1.15 var(--font-display); font-variant-numeric: tabular-nums; }
.stat-main .stat-value { font-size: 44px; color: var(--primary-ink); }
.stat-label { color: var(--muted); font-size: 12.5px; }
.legend { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 12.5px; color: var(--muted); }
.legend li { display: flex; align-items: center; gap: 6px; }
.legend i { width: 12px; height: 12px; border-radius: 50%; display: inline-block; }
.ahead h2 { margin: 0 0 8px; font: 700 14px/1.3 var(--font-display); }
.ahead ol { margin: 0; padding: 0; list-style: none; display: grid; gap: 10px; }
.ahead li { display: grid; gap: 4px; font-size: 13.5px; }
.ahead .row { display: flex; justify-content: space-between; gap: 12px; }
.ahead .name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ahead .count { color: var(--muted); white-space: nowrap; font-variant-numeric: tabular-nums; }
.ahead .bar { height: 6px; border-radius: 3px; background: #eaeef8; overflow: hidden; }
.ahead .bar span { display: block; height: 100%; background: var(--primary); border-radius: 3px; }
.ahead .empty { color: var(--muted); font-size: 13.5px; }
.credit { margin-top: auto; color: var(--muted); font-size: 12px; }
.credit a { color: var(--primary-ink); }
.map { height: 100%; min-height: 360px; }
.marker { width: 30px; height: 30px; cursor: pointer; border-radius: 50%; }
.dot { display: grid; place-items: center; width: 100%; height: 100%; border-radius: 50%; font: 700 11.5px/1 var(--font-sans); letter-spacing: -.02em; border: 2px solid rgba(255,255,255,.9); box-shadow: 0 1px 4px rgba(18,24,38,.35); transition: transform .15s ease; }
.marker:hover .dot, .marker:focus-visible .dot { transform: scale(1.15); }
.center-pin { width: 42px; height: 42px; border-radius: 50%; border: 3px solid var(--primary); box-shadow: 0 0 0 2px #fff; pointer-events: none; }
.maplibregl-popup-content { font: 13px/1.45 var(--font-sans); padding: 12px 14px; border-radius: var(--radius-sm); box-shadow: 0 6px 24px rgba(18,24,38,.18); }
.maplibregl-popup-content strong { font-family: var(--font-display); }
.maplibregl-popup-content ol { margin: 6px 0 0; padding-left: 18px; }
:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
@media (max-width: 760px) {
  .layout { grid-template-columns: 1fr; grid-template-rows: 58vh auto; height: auto; }
  .map { grid-row: 1; }
  .panel { grid-row: 2; border-right: 0; border-top: 1px solid var(--border); padding: 20px 16px; overflow: visible; }
}
@media (prefers-reduced-motion: reduce) { .dot { transition: none; } }
`;

const CLIENT_SCRIPT = `
(function () {
  var data = window.GRID;
  var $ = function (id) { return document.getElementById(id); };
  var tones = data.tones;
  function tone(rank) {
    if (typeof rank !== "number" || rank < 1) return tones[tones.length - 1];
    for (var i = 0; i < tones.length - 1; i++) if (rank <= tones[i].max) return tones[i];
    return tones[tones.length - 1];
  }
  var total = data.pointsTotal;
  var live = data.mode === "live";
  $("mode").textContent = live ? "Live" : "Test data";
  if (live) $("mode").classList.add("live");
  $("keyword").textContent = "\\u201c" + data.keyword + "\\u201d";
  $("place").textContent = data.place && data.place.name ? data.place.name : "";
  var format = data.shape === "square" ? data.size + "\\u00d7" + data.size + " grid" : data.shape + " grid, " + data.density + " density";
  var date = data.completedAt ? new Date(data.completedAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }) : "";
  $("meta").textContent = [format, data.radiusKm + " km radius", total + " points", date].filter(Boolean).join(" \\u00b7 ");
  $("avg").textContent = data.summary.average_rank === null ? "20+" : data.summary.average_rank.toFixed(1);
  if (data.summary.average_rank === null) $("avg-label").textContent = "not in the top 20 anywhere";
  else if (data.summary.found_points < total) $("avg-label").textContent = "average rank where the listing appears (" + data.summary.average_rank_with_misses.toFixed(1) + " counting misses as 21)";
  $("top3").textContent = data.summary.top3_points + "/" + total;
  $("found").textContent = data.summary.found_points + "/" + total;

  tones.forEach(function (t) {
    var li = document.createElement("li");
    var swatch = document.createElement("i");
    swatch.style.background = t.fill;
    li.appendChild(swatch);
    li.appendChild(document.createTextNode(t.label));
    $("legend").appendChild(li);
  });

  var ahead = data.competitors;
  if (ahead.length === 0) {
    var none = document.createElement("li");
    none.className = "empty";
    none.textContent = "Nobody: the listing is first wherever it appears.";
    $("competitors").appendChild(none);
  }
  ahead.forEach(function (c) {
    var li = document.createElement("li");
    var row = document.createElement("div"); row.className = "row";
    var name = document.createElement("span"); name.className = "name"; name.textContent = c.name; name.title = c.name;
    var count = document.createElement("span"); count.className = "count"; count.textContent = c.ahead_points + "/" + total + " points";
    row.appendChild(name); row.appendChild(count);
    var bar = document.createElement("div"); bar.className = "bar";
    var fill = document.createElement("span"); fill.style.width = Math.round((c.ahead_points / total) * 100) + "%";
    bar.appendChild(fill);
    li.appendChild(row); li.appendChild(bar);
    $("competitors").appendChild(li);
  });

  if (!window.maplibregl) { $("map").textContent = "The map library could not load (offline?). The figures on the left are complete."; return; }
  var map = new maplibregl.Map({ container: "map", style: data.mapStyle, center: [data.points[0].lng, data.points[0].lat], zoom: 12, attributionControl: { compact: false } });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

  var bounds = new maplibregl.LngLatBounds();
  data.points.forEach(function (p) {
    var t = tone(p.rank);
    var label = p.rank === null ? "Not in the top 20" : "Rank " + p.rank;
    var wrapper = document.createElement("div");
    wrapper.className = "marker";
    wrapper.tabIndex = 0;
    wrapper.setAttribute("role", "button");
    wrapper.setAttribute("aria-label", label);
    var dot = document.createElement("div");
    dot.className = "dot";
    dot.style.background = t.fill;
    dot.style.color = t.ink;
    dot.textContent = p.rank === null ? "20+" : String(p.rank);
    wrapper.appendChild(dot);
    var box = document.createElement("div");
    var head = document.createElement("strong");
    head.textContent = label + " here";
    box.appendChild(head);
    if (p.top.length) {
      var list = document.createElement("ol");
      p.top.forEach(function (entry) { var item = document.createElement("li"); item.textContent = entry.name; list.appendChild(item); });
      box.appendChild(list);
    }
    var marker = new maplibregl.Marker({ element: wrapper })
      .setLngLat([p.lng, p.lat])
      .setPopup(new maplibregl.Popup({ offset: 18, closeButton: false }).setDOMContent(box))
      .addTo(map);
    wrapper.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); marker.togglePopup(); }
    });
    bounds.extend([p.lng, p.lat]);
  });
  if (data.place && typeof data.place.lat === "number") {
    var pin = document.createElement("div");
    pin.className = "center-pin";
    pin.title = data.place.name || "Listing";
    new maplibregl.Marker({ element: pin }).setLngLat([data.place.lng, data.place.lat]).addTo(map);
    bounds.extend([data.place.lng, data.place.lat]);
  }
  if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 48, duration: 0 });
})();
`;
