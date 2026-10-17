#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { USAGE, UsageError, parseCli, slugify } from "./src/args.js";
import { ApiError, createClient, explainError } from "./src/api.js";
import { pointsToCsv } from "./src/csv.js";
import { renderHtml } from "./src/render-html.js";
import { renderRanks, renderSummary } from "./src/render-terminal.js";

const KEY_PATTERN = /^gga_(live|test)_/;
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;

function loadEnvFile() {
  if (!existsSync(".env")) return;
  if (typeof process.loadEnvFile !== "function") {
    console.error(`.env is ignored: Node.js ${process.versions.node} cannot read it (20.12 or later can). Export GEOGRIDAPI_API_KEY instead.`);
    return;
  }
  process.loadEnvFile(".env");
}

async function confirm(question) {
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return /^y(es)?$/i.test((await prompt.question(question)).trim());
  } finally {
    prompt.close();
  }
}

function describeRequest(request) {
  const target = request.query ? `"${request.query}"` : `place ${request.place_id}`;
  const format = request.shape === "square" ? `${request.size}×${request.size}` : `${request.shape} (${request.density})`;
  return `${target}, keyword "${request.keyword}", ${format} grid`;
}

/** Shows what will be measured and its price, and asks before spending credits. */
async function approveCost(client, request, { yes }) {
  const estimate = await client.estimate(request);
  console.log(describeRequest(request));
  if (estimate.credits === 0) {
    console.log(`${estimate.points} points, free with a test key (sample data).`);
    return true;
  }
  const upTo = estimate.exact === false ? "up to " : "";
  const line = `${upTo}${estimate.points} points = ${upTo}${estimate.credits} credits (balance ${estimate.balance} → ${estimate.balance_after}).`;
  if (!estimate.enough) {
    console.error(`${line}\nNot enough credits. Top up at https://geogridapi.io/en/console.`);
    return false;
  }
  if (yes) {
    console.log(line);
    return true;
  }
  if (!process.stdin.isTTY) {
    console.error(`${line}\nAdd --yes to run a paid grid without a prompt.`);
    return false;
  }
  return confirm(`${line} Run it? [y/N] `);
}

function defaultOutDir(grid) {
  const name = slugify(grid.place?.name ?? "") || "listing";
  const keyword = slugify(grid.keyword ?? "", 30) || "keyword";
  const date = (grid.completed_at ?? new Date().toISOString()).slice(0, 10);
  const dir = join("output", `${name}-${keyword}-${date}`);
  // Never overwrite an earlier grid of the same day.
  return existsSync(dir) ? `${dir}-${grid.id.slice(0, 8)}` : dir;
}

async function saveOutputs(client, grid, { outDir, image }) {
  await mkdir(outDir, { recursive: true });
  const files = {
    "grid.json": `${JSON.stringify(grid, null, 2)}\n`,
    "ranks.csv": pointsToCsv(grid),
    "heatmap.html": renderHtml(grid),
  };
  if (image) {
    try {
      files["heatmap.png"] = await client.getImage(grid.id, "en");
    } catch (error) {
      console.error(`PNG skipped: ${explainError(error)}`);
    }
  }
  await Promise.all(Object.entries(files).map(([name, content]) => writeFile(join(outDir, name), content)));
  return Object.keys(files).map((name) => join(outDir, name));
}

let currentGridId = null;

async function main() {
  loadEnvFile();
  const options = parseCli(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
    return 0;
  }

  const apiKey = process.env.GEOGRIDAPI_API_KEY?.trim();
  if (!apiKey) throw new UsageError("Set GEOGRIDAPI_API_KEY (in .env or your shell). Free test keys: https://geogridapi.io/en/signup");
  if (!KEY_PATTERN.test(apiKey)) throw new UsageError("GEOGRIDAPI_API_KEY should start with gga_live_ or gga_test_.");

  const client = createClient({ apiKey });
  if (options.gridId) {
    currentGridId = options.gridId;
  } else {
    if (!(await approveCost(client, options.request, options))) return 1;
    const created = await client.createGrid(options.request, randomUUID());
    currentGridId = created.id;
    console.log(`Grid ${created.id} created. If this run stops, finish it with: node heatmap.js --grid-id ${created.id}`);
  }

  const grid = await client.waitForGrid(currentGridId, {
    onTick: (current, elapsed) => {
      if (process.stdout.isTTY) process.stdout.write(`\rMeasuring ${current.points_total} points… ${Math.round(elapsed / 1000)} s`);
    },
  });
  if (process.stdout.isTTY) process.stdout.write("\r\x1b[2K");

  if (grid.status === "failed") {
    const reason = typeof grid.error === "string" ? grid.error : grid.error?.message;
    console.error(`The grid failed: ${reason ?? "unknown error"}. Its credits were refunded.`);
    return 1;
  }

  const outDir = options.out ?? defaultOutDir(grid);
  const files = await saveOutputs(client, grid, { outDir, image: options.image });

  console.log(`\n${renderRanks(grid, { useColor })}\n`);
  console.log(renderSummary(grid));
  console.log(`\nSaved:\n${files.map((file) => `  ${file}`).join("\n")}`);
  console.log(`Open ${join(outDir, "heatmap.html")} in your browser for the interactive map.`);
  return 0;
}

try {
  process.exitCode = await main();
} catch (error) {
  if (error instanceof UsageError || error.code?.startsWith?.("ERR_PARSE_ARGS")) {
    console.error(`${error.message}\n\n${USAGE}`);
    process.exitCode = 2;
  } else if (error.name === "AbortError") {
    console.error("\nCancelled.");
    process.exitCode = 130;
  } else {
    console.error(explainError(error));
    if (currentGridId) console.error(`Your grid may still complete: node heatmap.js --grid-id ${currentGridId}`);
    process.exitCode = 1;
  }
}
