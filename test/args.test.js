import assert from "node:assert/strict";
import { test } from "node:test";
import { UsageError, parseCli, slugify } from "../src/args.js";

test("a business and a keyword make a 7×7 square grid by default", () => {
  const { request, image, yes } = parseCli(["Joe's Pizza, New York", "pizza"]);

  assert.deepEqual(request, { query: "Joe's Pizza, New York", keyword: "pizza", shape: "square", size: 7 });
  assert.equal(image, true);
  assert.equal(yes, false);
});

test("--place-id takes the keyword as the first positional", () => {
  const { request } = parseCli(["--place-id", "ChIJabc", "pizza", "--size", "9", "--radius", "3", "--country", "US"]);

  assert.deepEqual(request, { place_id: "ChIJabc", keyword: "pizza", shape: "square", size: 9, radius_km: 3, country: "us" });
});

test("other shapes use a density, never a size", () => {
  const { request } = parseCli(["Cafe, Lyon", "café", "--shape", "circle", "--density", "high"]);

  assert.deepEqual(request, { query: "Cafe, Lyon", keyword: "café", shape: "circle", density: "high" });
  assert.throws(() => parseCli(["Cafe, Lyon", "café", "--shape", "circle", "--size", "5"]), UsageError);
  assert.throws(() => parseCli(["Cafe, Lyon", "café", "--density", "low"]), UsageError);
});

test("invalid input is refused with a usage error", () => {
  assert.throws(() => parseCli([]), /business/);
  assert.throws(() => parseCli(["Joe's Pizza"]), /keyword/);
  assert.throws(() => parseCli(["a", "b", "--size", "4"]), /3, 5, 7 or 9/);
  assert.throws(() => parseCli(["a", "b", "--radius", "100"]), /between 0.5 and 30/);
  assert.throws(() => parseCli(["a", "b", "--radius", "far"]), /must be a number/);
  assert.throws(() => parseCli(["a", "b", "--shape", "star"]), /--shape must be one of/);
  assert.throws(() => parseCli(["a", "b", "--language", "english"]), /2-letter code/);
  assert.throws(() => parseCli(["a", "x".repeat(121)]), /120 characters/);
});

test("extra words are refused instead of being measured as the wrong query", () => {
  assert.throws(() => parseCli(["Joe's", "Pizza", "Broadway,", "New", "York", "pizza"]), /Too many arguments/);
  assert.throws(() => parseCli(["--place-id", "ChIJabc", "Joe's Pizza, New York", "pizza"]), /Too many arguments/);
  assert.throws(() => parseCli(["Joe's Pizza", "pizza", "--keyword", "pizza"]), /Too many arguments/);
});

test("--grid-id resumes a grid without a business or keyword", () => {
  assert.deepEqual(parseCli(["--grid-id", "g-1", "--no-image"]), { help: false, gridId: "g-1", out: undefined, image: false, yes: false });
  assert.throws(() => parseCli(["--grid-id", "g-1", "pizza"]), /takes no business/);
});

test("shapes other than the square need a radius of at least 1 km", () => {
  assert.throws(() => parseCli(["a", "b", "--shape", "circle", "--radius", "0.5"]), /between 1 and 30 km/);
  assert.equal(parseCli(["a", "b", "--radius", "0.5"]).request.radius_km, 0.5);
});

test("--help short-circuits validation", () => {
  assert.deepEqual(parseCli(["--help"]), { help: true });
});

test("slugify makes folder-safe names", () => {
  assert.equal(slugify("Joe's Pizza, New York"), "joe-s-pizza-new-york");
  assert.equal(slugify("Crêperie Ty Breiz — Rennes"), "creperie-ty-breiz-rennes");
  assert.equal(slugify("a".repeat(50), 10), "aaaaaaaaaa");
  assert.equal(slugify("東京ラーメン"), "", "non-Latin names fall back to a default folder name");
});
