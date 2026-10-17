import { randomUUID } from "node:crypto";

export const API_BASE = "https://api.geogridapi.io/v1";
const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 6 * 60_000;
const MAX_RETRY_AFTER_MS = 30_000;
const REQUEST_TIMEOUT_MS = 60_000;
const MAX_POLL_FAILURES = 5;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

export class ApiError extends Error {
  constructor(status, code, message, details = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function retryDelay(response) {
  const seconds = Number(response?.headers.get("retry-after"));
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, MAX_RETRY_AFTER_MS) : POLL_INTERVAL_MS;
}

/** A transient failure: worth another try with the same request. */
export function isTransient(error) {
  if (error instanceof ApiError) return RETRYABLE_STATUSES.has(error.status) || error.code === "network_error";
  return false;
}

/** Minimal GeoGridAPI client. `fetchImpl` and `wait` are injectable for tests. */
export function createClient({ apiKey, baseUrl = API_BASE, fetchImpl = fetch, wait = sleep }) {
  async function send(path, { method, body, headers, binary }) {
    let response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "User-Agent": "local-rank-heatmap",
          ...(body && { "Content-Type": "application/json" }),
          ...headers,
        },
        body: body && JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new ApiError(0, "network_error", `Could not reach GeoGridAPI (${error.cause?.code ?? error.name}).`);
    }
    if (response.ok) return binary ? Buffer.from(await response.arrayBuffer()) : response.json();

    const payload = await response.json().catch(() => ({}));
    const { code = "http_error", message = `HTTP ${response.status}`, ...details } = payload.error ?? {};
    const error = new ApiError(response.status, code, message, details);
    error.retryAfterMs = retryDelay(response);
    throw error;
  }

  // POSTs carry an Idempotency-Key, so retrying them never creates a second grid.
  async function request(path, { method = "GET", body, headers = {}, binary = false, retries = 2 } = {}) {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await send(path, { method, body, headers, binary });
      } catch (error) {
        if (!isTransient(error) || attempt >= retries) throw error;
        await wait(error.retryAfterMs ?? POLL_INTERVAL_MS);
      }
    }
  }

  return {
    estimate: (grid) => request("/grids/estimate", { method: "POST", body: grid }),

    createGrid: (grid, idempotencyKey = randomUUID()) =>
      request("/grids", { method: "POST", body: grid, headers: { "Idempotency-Key": idempotencyKey } }),

    getGrid: (id) => request(`/grids/${encodeURIComponent(id)}`),

    getImage: (id, lang = "en") =>
      request(`/grids/${encodeURIComponent(id)}/image?lang=${encodeURIComponent(lang)}`, { binary: true }),

    /** Polls a grid until it is completed or failed, riding out short outages. */
    async waitForGrid(id, { onTick = () => {}, timeoutMs = POLL_TIMEOUT_MS } = {}) {
      const startedAt = Date.now();
      let failures = 0;
      for (;;) {
        let grid = null;
        try {
          grid = await this.getGrid(id);
          failures = 0;
        } catch (error) {
          failures += 1;
          if (!isTransient(error) || failures >= MAX_POLL_FAILURES) throw error;
        }
        if (grid?.status === "completed" || grid?.status === "failed") return grid;
        const elapsed = Date.now() - startedAt;
        if (elapsed > timeoutMs) {
          throw new ApiError(0, "timeout", `Grid ${id} is still ${grid?.status ?? "running"} after ${Math.round(elapsed / 1000)} s.`);
        }
        if (grid) onTick(grid, elapsed);
        await wait(POLL_INTERVAL_MS);
      }
    },
  };
}

/** One-line explanation of an API error for the terminal. */
export function explainError(error) {
  if (!(error instanceof ApiError)) return error.message;
  switch (error.code) {
    case "invalid_key":
      return "GeoGridAPI rejected the key. Check GEOGRIDAPI_API_KEY (console: https://geogridapi.io/en/console).";
    case "insufficient_points":
      return `Not enough credits: this grid needs ${error.details.required ?? "more"}, your balance is ${error.details.balance ?? "too low"}. Top up at https://geogridapi.io/en/console.`;
    case "place_not_found":
      return `${error.message} Try "name, city", or pass --place-id.`;
    default:
      return `${error.message} (${error.code}${error.status ? `, HTTP ${error.status}` : ""})`;
  }
}
