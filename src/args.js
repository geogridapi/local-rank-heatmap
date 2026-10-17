import { parseArgs } from "node:util";

export const SHAPES = ["square", "circle", "diamond", "hexagon", "cross", "ellipse", "rectangle"];
const SIZES = [3, 5, 7, 9];
const DENSITIES = ["low", "medium", "high"];

export const USAGE = `Usage:
  node heatmap.js "<business name, city>" "<keyword>" [options]
  node heatmap.js --place-id ChIJ… --keyword "<keyword>" [options]
  node heatmap.js --grid-id <id>      Finish or redraw a grid you already ran (no new charge)

Quote the business when it contains spaces: "Joe's Pizza Broadway, New York".

Options:
  --size <3|5|7|9>        Square grid side (default 7, so 49 points)
  --shape <shape>         square (default), circle, diamond, hexagon, cross, ellipse, rectangle
  --density <level>       low, medium or high, for shapes other than the square
  --radius <km>           Distance from the center to the edge (0.5 to 30 km; 1 to 30 for other shapes)
  --language <code>       Search language, 2 letters (default: your account's)
  --country <code>        Search country, 2 letters
  --out <dir>             Output folder (default: output/<business>-<keyword>-<date>)
  --no-image              Skip the PNG map
  --yes, -y               Run a paid grid without asking
  --help, -h              Show this help

Environment:
  GEOGRIDAPI_API_KEY      Your key (gga_test_ keys are free, gga_live_ keys spend credits)`;

export class UsageError extends Error {}

function toNumber(value, name) {
  if (value === undefined) return undefined;
  const number = Number(value);
  if (!Number.isFinite(number)) throw new UsageError(`--${name} must be a number, got "${value}".`);
  return number;
}

function toCode(value, name) {
  if (value === undefined) return undefined;
  if (!/^[a-z]{2}$/i.test(value)) throw new UsageError(`--${name} must be a 2-letter code, got "${value}".`);
  return value.toLowerCase();
}

/** Parses argv into a validated grid request plus CLI flags. Throws UsageError on bad input. */
export function parseCli(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      "place-id": { type: "string" },
      "grid-id": { type: "string" },
      keyword: { type: "string", short: "k" },
      size: { type: "string" },
      shape: { type: "string" },
      density: { type: "string" },
      radius: { type: "string" },
      language: { type: "string" },
      country: { type: "string" },
      out: { type: "string" },
      "no-image": { type: "boolean", default: false },
      yes: { type: "boolean", short: "y", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.help) return { help: true };

  const output = { out: values.out, image: !values["no-image"], yes: values.yes };
  const gridId = values["grid-id"]?.trim();
  if (gridId) {
    if (positionals.length > 0) throw new UsageError("--grid-id takes no business or keyword.");
    return { help: false, gridId, ...output };
  }

  const placeId = values["place-id"]?.trim();
  const expected = (placeId ? 0 : 1) + (values.keyword === undefined ? 1 : 0);
  if (positionals.length > expected) {
    throw new UsageError(`Too many arguments: ${positionals.map((value) => `"${value}"`).join(" ")}. Quote the business and the keyword.`);
  }
  const [first, second] = positionals;
  const query = placeId ? undefined : first?.trim();
  const keyword = (values.keyword ?? (placeId ? first : second))?.trim();

  if (!placeId && !query) throw new UsageError("Give a business (\"name, city\") or --place-id.");
  if (!keyword) throw new UsageError("Give a keyword, for example \"pizza\".");
  if (keyword.length > 120) throw new UsageError("The keyword must be 120 characters or less.");

  const shape = values.shape ?? "square";
  if (!SHAPES.includes(shape)) throw new UsageError(`--shape must be one of: ${SHAPES.join(", ")}.`);

  const size = toNumber(values.size, "size");
  if (size !== undefined && shape !== "square") throw new UsageError("--size only applies to the square shape.");
  if (size !== undefined && !SIZES.includes(size)) throw new UsageError("--size must be 3, 5, 7 or 9.");

  const density = values.density;
  if (density !== undefined && shape === "square") throw new UsageError("--density only applies to shapes other than the square.");
  if (density !== undefined && !DENSITIES.includes(density)) throw new UsageError("--density must be low, medium or high.");

  const radius = toNumber(values.radius, "radius");
  const minRadius = shape === "square" ? 0.5 : 1;
  if (radius !== undefined && (radius < minRadius || radius > 30)) throw new UsageError(`--radius must be between ${minRadius} and 30 km for the ${shape} shape.`);

  const request = {
    ...(placeId ? { place_id: placeId } : { query }),
    keyword,
    shape,
    ...(shape === "square" ? { size: size ?? 7 } : { density: density ?? "medium" }),
    ...(radius !== undefined && { radius_km: radius }),
    ...(values.language && { language: toCode(values.language, "language") }),
    ...(values.country && { country: toCode(values.country, "country") }),
  };

  return { help: false, request, ...output };
}

/** Folder-safe slug: "Joe's Pizza, New York" -> "joe-s-pizza-new-york". */
export function slugify(text, maxLength = 40) {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
}
