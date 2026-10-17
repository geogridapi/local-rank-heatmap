import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError, createClient, explainError } from "../src/api.js";

function jsonResponse(status, body, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

function fakeFetch(responses) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (!next) throw new Error(`unexpected request to ${url}`);
    return next;
  };
  return { calls, fetchImpl };
}

const noWait = async () => {};

test("createGrid sends the key, the body and an Idempotency-Key", async () => {
  const { calls, fetchImpl } = fakeFetch([jsonResponse(202, { id: "g1", status: "pending" })]);
  const client = createClient({ apiKey: "gga_test_x", fetchImpl, wait: noWait });

  const grid = await client.createGrid({ query: "Joe's", keyword: "pizza" }, "idem-1");

  assert.equal(grid.id, "g1");
  assert.equal(calls[0].url, "https://api.geogridapi.io/v1/grids");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.Authorization, "Bearer gga_test_x");
  assert.equal(calls[0].init.headers["Idempotency-Key"], "idem-1");
  assert.deepEqual(JSON.parse(calls[0].init.body), { query: "Joe's", keyword: "pizza" });
});

test("503 and 429 are retried with the same request", async () => {
  const { calls, fetchImpl } = fakeFetch([
    jsonResponse(503, { error: { code: "engine_unavailable", message: "busy" } }, { "retry-after": "2" }),
    jsonResponse(202, { id: "g1", status: "pending" }),
  ]);
  const waits = [];
  const client = createClient({ apiKey: "k", fetchImpl, wait: async (ms) => waits.push(ms) });

  await client.createGrid({ query: "a", keyword: "b" }, "idem-2");

  assert.equal(calls.length, 2);
  assert.equal(calls[1].init.headers["Idempotency-Key"], "idem-2");
  assert.deepEqual(waits, [2000]);
});

test("a network error or a 502 is retried, then reported as an ApiError", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls === 1) throw new TypeError("fetch failed", { cause: { code: "ECONNRESET" } });
    if (calls === 2) return jsonResponse(502, {});
    return jsonResponse(200, { id: "g1", status: "completed" });
  };
  const client = createClient({ apiKey: "k", fetchImpl, wait: noWait });

  const grid = await client.getGrid("g1");

  assert.equal(grid.status, "completed");
  assert.equal(calls, 3);
  const offline = createClient({ apiKey: "k", fetchImpl: async () => { throw new TypeError("fetch failed"); }, wait: noWait });
  await assert.rejects(offline.getGrid("g1"), (error) => error instanceof ApiError && error.code === "network_error");
});

test("waitForGrid rides out a short outage while polling", async () => {
  const { fetchImpl } = fakeFetch([
    jsonResponse(200, { id: "g1", status: "running" }),
    jsonResponse(503, {}), jsonResponse(503, {}), jsonResponse(503, {}),
    jsonResponse(200, { id: "g1", status: "completed" }),
  ]);
  const client = createClient({ apiKey: "k", fetchImpl, wait: noWait });

  const grid = await client.waitForGrid("g1");

  assert.equal(grid.status, "completed");
});

test("API errors keep their code and details", async () => {
  const { fetchImpl } = fakeFetch([
    jsonResponse(402, { error: { code: "insufficient_points", message: "Not enough credits", required: 49, balance: 10 } }),
  ]);
  const client = createClient({ apiKey: "k", fetchImpl, wait: noWait });

  const error = await client.estimate({}).catch((caught) => caught);

  assert.ok(error instanceof ApiError);
  assert.equal(error.status, 402);
  assert.equal(error.code, "insufficient_points");
  assert.match(explainError(error), /needs 49, your balance is 10/);
});

test("waitForGrid polls until the grid is completed", async () => {
  const { calls, fetchImpl } = fakeFetch([
    jsonResponse(200, { id: "g1", status: "pending", points_total: 49 }),
    jsonResponse(200, { id: "g1", status: "running", points_total: 49 }),
    jsonResponse(200, { id: "g1", status: "completed", points_total: 49 }),
  ]);
  const ticks = [];
  const client = createClient({ apiKey: "k", fetchImpl, wait: noWait });

  const grid = await client.waitForGrid("g1", { onTick: (current) => ticks.push(current.status) });

  assert.equal(grid.status, "completed");
  assert.equal(calls.length, 3);
  assert.deepEqual(ticks, ["pending", "running"]);
});

test("waitForGrid gives up after its timeout", async () => {
  const { fetchImpl } = fakeFetch([jsonResponse(200, { id: "g1", status: "running" })]);
  const client = createClient({ apiKey: "k", fetchImpl, wait: noWait });

  await assert.rejects(client.waitForGrid("g1", { timeoutMs: -1 }), /still running/);
});

test("getImage returns the PNG bytes", async () => {
  const png = new Uint8Array([137, 80, 78, 71]);
  const { calls, fetchImpl } = fakeFetch([new Response(png, { status: 200, headers: { "content-type": "image/png" } })]);
  const client = createClient({ apiKey: "k", fetchImpl, wait: noWait });

  const bytes = await client.getImage("g 1", "fr");

  assert.deepEqual([...bytes], [137, 80, 78, 71]);
  assert.equal(calls[0].url, "https://api.geogridapi.io/v1/grids/g%201/image?lang=fr");
});
