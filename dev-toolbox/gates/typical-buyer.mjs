#!/usr/bin/env node
/**
 * Gate : **le pro type ne se fabrique que dans l'export de la grille de prix.**
 *
 * `TypicalBuyer` (`apps/lfd-api/src/lafoliecoffee/promotions/domain/lot-buyer.ts`) est
 * un acheteur DÉCLARÉ par le staff : une société active, ou en cours
 * d'inscription, qui n'existe pas. La porte du prix le tarife comme un pro,
 * avec les promotions de sa clientèle. Fabriqué depuis une route de la
 * boutique, il publierait à n'importe quel visiteur une promotion réservée aux
 * pros (`documentation/pricing/plan-export-grille-de-prix.md`, § 8.1).
 *
 * Le type le tient à moitié : constructeur privé, classe nominale — un
 * littéral ne le contrefait pas. Reste la fabrique, que tout fichier pourrait
 * appeler. D'où la porte :
 *
 * - `lot-buyer.js` ne s'importe en VALEUR que par la fabrique
 *   `lafoliecoffee/pricing/application/price-grid-typical-buyer.ts` ;
 * - la fabrique ne s'importe en VALEUR que par
 *   `lafoliecoffee/pricing/application/price-grid-*` — l'export staff, sous
 *   `b2b_pricing:read`.
 *
 * `import type` est libre (élidé à la compilation, `verbatimModuleSyntax`) :
 * la porte du prix, le point ligne et le rayon lisent le TYPE pour leur
 * `switch` exhaustif. `import { type X }` laisse un import à l'exécution et
 * compte comme une valeur — comme pour `lint:import-cycles`. Les tests ne
 * sont pas lus : ils éprouvent la fabrique, ils ne servent rien.
 *
 * Usage : `pnpm gate typical-buyer` (branché dans `lint:gates`).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SCAN_ROOT = "apps/lfd-api/src";
const SKIP_DIRS = new Set(["node_modules", "dist", "client", "coverage", ".turbo", "__tests__"]);

const PRICING_APP = "apps/lfd-api/src/lafoliecoffee/pricing/application/";
const FACTORY = `${PRICING_APP}price-grid-typical-buyer.ts`;

/** Ce qui est gardé : le module, et qui peut l'importer en valeur. */
const GUARDED = [
  {
    module: /(?:^|\/)lot-buyer\.js$/u,
    name: "lot-buyer.js (TypicalBuyer)",
    admits: (rel) => rel === FACTORY,
    door: "la fabrique `priceGridTypicalBuyer` (price-grid-typical-buyer.ts)",
  },
  {
    module: /(?:^|\/)price-grid-typical-buyer\.js$/u,
    name: "price-grid-typical-buyer.js (la fabrique)",
    admits: (rel) =>
      rel.startsWith(PRICING_APP) && /^price-grid-[^/]*\.ts$/u.test(rel.slice(PRICING_APP.length)),
    door: "lafoliecoffee/pricing/application/price-grid-* — l'export staff",
  },
];

/** Commentaires retirés : une porte qui lit la PROSE ne garde rien. */
function withoutComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/^\s*\/\/.*$/gmu, "");
}

/**
 * Les modules importés EN VALEUR par ce source : `import … from`, `export … from`,
 * `import("…")` — hors `import type` / `export type`, élidés.
 */
export function valueImports(source) {
  const code = withoutComments(source);
  const found = [];
  const statics = /^\s*(import|export)\s+(type\s+)?([\s\S]*?)\s*from\s*["']([^"']+)["']/gmu;
  for (const match of code.matchAll(statics)) {
    if (match[2] === undefined) {
      found.push(match[4]);
    }
  }
  for (const match of code.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/gu)) {
    found.push(match[1]);
  }
  return found;
}

/** Les violations d'un fichier : `[{ guarded, specifier }]`. */
export function violationsOf(rel, source) {
  return valueImports(source).flatMap((specifier) =>
    GUARDED.filter((guard) => guard.module.test(specifier) && !guard.admits(rel)).map(
      (guarded) => ({ guarded, specifier }),
    ),
  );
}

/**
 * Le détecteur, éprouvé à chaque exécution. Une porte dont le motif s'est
 * cassé ne refuse plus rien, et le dit en vert.
 */
function selfCheck() {
  const SHOP =
    "apps/lfd-api/src/lafoliecoffee/catalog/application/shop-catalogue-pricing.service.ts";
  const CONTEXT = `${PRICING_APP}price-grid-context.ts`;
  const cases = [
    // Une route de la boutique qui fabrique un pro type : refusé.
    [SHOP, 'import { TypicalBuyer } from "../../promotions/domain/lot-buyer.js";', 1],
    [
      SHOP,
      'import { priceGridTypicalBuyer } from "../../pricing/application/price-grid-typical-buyer.js";',
      1,
    ],
    [SHOP, 'import { type TypicalBuyer } from "../../promotions/domain/lot-buyer.js";', 1],
    [SHOP, 'export { TypicalBuyer } from "../../promotions/domain/lot-buyer.js";', 1],
    [SHOP, 'const m = await import("../../promotions/domain/lot-buyer.js");', 1],
    // Le contexte de la grille passe par la fabrique, pas par la classe.
    [CONTEXT, 'import { TypicalBuyer } from "../../promotions/domain/lot-buyer.js";', 1],
    // Admis.
    [SHOP, 'import type { LotBuyer } from "../../promotions/domain/lot-buyer.js";', 0],
    [SHOP, 'export type { LotBuyer } from "../domain/lot-buyer.js";', 0],
    [SHOP, '// import { TypicalBuyer } from "../../promotions/domain/lot-buyer.js";', 0],
    [CONTEXT, 'import { priceGridTypicalBuyer } from "./price-grid-typical-buyer.js";', 0],
    [FACTORY, 'import { TypicalBuyer } from "../../promotions/domain/lot-buyer.js";', 0],
  ];
  const broken = cases.filter(
    ([rel, source, expected]) => violationsOf(rel, source).length !== expected,
  );
  if (broken.length > 0) {
    console.error(`✗ typical-buyer : le détecteur se trompe sur ${broken.length} cas témoin(s) :`);
    for (const [rel, source] of broken) {
      console.error(`    ${rel} ← ${source}`);
    }
    process.exit(1);
  }
}

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return SKIP_DIRS.has(entry.name) ? [] : sourceFiles(path);
    }
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".spec.ts") ? [path] : [];
  });
}

const unix = (path) => path.split("\\").join("/");

selfCheck();

const root = join(ROOT, SCAN_ROOT);
if (!statSync(root, { throwIfNoEntry: false })?.isDirectory()) {
  console.error(`✗ typical-buyer : ${SCAN_ROOT} introuvable.`);
  process.exit(1);
}
if (!statSync(join(ROOT, FACTORY), { throwIfNoEntry: false })?.isFile()) {
  console.error(
    `✗ typical-buyer : la fabrique ${FACTORY} a disparu — la porte ne garde plus rien.`,
  );
  process.exit(1);
}

const offenders = sourceFiles(root).flatMap((file) => {
  const rel = unix(relative(ROOT, file));
  return violationsOf(rel, readFileSync(file, "utf8")).map((found) => ({ rel, ...found }));
});

if (offenders.length > 0) {
  for (const { rel, guarded } of offenders) {
    console.error(
      `✗ ${rel}\n    importe en valeur ${guarded.name} ; seul(e) ${guarded.door} le peut.`,
    );
  }
  console.error(
    "\n  Un pro type est une société qui n'existe pas : fabriqué hors de l'export staff,\n" +
      "  il tarifierait un visiteur comme un pro (plan-export-grille-de-prix.md, § 8.1).\n" +
      "  Pour lire le TYPE, écrivez `import type { … }`.\n",
  );
  process.exit(1);
}

console.log("✓ typical-buyer : le pro type ne se fabrique que dans l'export de la grille de prix.");
