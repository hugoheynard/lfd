/**
 * Construit EN MÉMOIRE le recueil des textes de la boutique et son manifeste
 * (plan `documentation/contenu-ecommerce/plan-textes-de-la-boutique.md`, §7 bis).
 *
 * Partagé par le générateur (`shop-copy-digest.mjs`, qui écrit) et par la porte
 * (`gates/shop-copy-digest.mjs`, qui compare) : les deux ne peuvent pas
 * diverger sur ce que « le recueil à jour » veut dire.
 *
 * Aplatissement : un objet donne `parent.enfant`, un tableau `parent.0`. Une
 * FONCTION n'est pas un texte qu'on peut recopier — elle part dans la section
 * « non recensé », jamais au silence ; de même pour une valeur ni chaîne, ni
 * objet, ni tableau (un nombre, un booléen).
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import * as prettier from "prettier";

import { importTs, ROOT } from "./load-ts.mjs";
import { renderDigest } from "./render.mjs";
import { GRAFTED_SCREEN_FILES, ORDER_JOURNEY, OTHER_SPACES } from "./spaces.mjs";

export const COPY_DIR = "apps/lfc-ecommerce-frontend/src/app/client/copy";
export const DIGEST_PATH = "documentation/contenu-ecommerce/textes-de-la-boutique.md";
export const MANIFEST_PATH = `${COPY_DIR}/shop-copy-manifest.json`;
export const REGENERATE = "pnpm copy:digest";

const LOCALES = ["fr", "en", "it"];
const VARIABLE = /\{(\w+)\}/g;

function flatten(value, path, out) {
  if (typeof value === "string") out.texts.set(path, value);
  else if (typeof value === "function") out.skipped.set(path, "fonction");
  else if (Array.isArray(value)) value.forEach((v, i) => flatten(v, `${path}.${i}`, out));
  else if (value !== null && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) flatten(v, `${path}.${k}`, out);
  } else out.skipped.set(path, value === null ? "null" : typeof value);
}

async function loadSpace(def, dictionaries) {
  if (def.kind === "dictionary") return LOCALES.map((l) => dictionaries[l][def.space]);
  const mod = await importTs(`${COPY_DIR}/${def.entry ?? def.file}`);
  if (typeof mod[def.fn] !== "function") {
    throw new Error(
      `${def.file} n'exporte plus ${def.fn}(locale) : mettre à jour dev-toolbox/shop-copy/spaces.mjs.`,
    );
  }
  return LOCALES.map((l) => mod[def.fn](l));
}

function collectSpace(def, perLocale) {
  const flat = perLocale.map((value) => {
    const out = { texts: new Map(), skipped: new Map() };
    flatten(value, def.space, out);
    return out;
  });
  const keys = [...new Set(flat.flatMap((f) => [...f.texts.keys()]))];
  const entries = keys.map((key) => {
    const [fr, en, it] = flat.map((f) => f.texts.get(key) ?? null);
    const variables = [
      ...new Set([fr, en, it].flatMap((t) => [...(t ?? "").matchAll(VARIABLE)].map((m) => m[1]))),
    ];
    return { key, fr, en, it, variables };
  });
  const skippedKeys = [...new Set(flat.flatMap((f) => [...f.skipped.keys()]))];
  const unrecorded = skippedKeys.map((key) => ({
    key,
    kind: flat.map((f) => f.skipped.get(key)).find(Boolean),
  }));
  return {
    space: def.space,
    title: def.title,
    source: def.file ?? "fr.ts · en.ts · it.ts",
    journey: ORDER_JOURNEY.includes(def),
    entries,
    unrecorded,
  };
}

/** Refuse un espace que personne ne range : un oubli ne passe pas en silence. */
function assertEverythingIsRanged(dictionaries) {
  const all = [...ORDER_JOURNEY, ...OTHER_SPACES];
  const ranged = new Set(all.filter((d) => d.kind === "dictionary").map((d) => d.space));
  const missing = Object.keys(dictionaries.fr).filter((k) => !ranged.has(k));
  const files = new Set(all.flatMap((d) => (d.kind === "screen" ? [d.entry ?? d.file] : [])));
  const orphanFiles = readdirSync(join(ROOT, COPY_DIR, "screens"))
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".spec.ts"))
    .map((f) => `screens/${f}`)
    .filter((f) => !files.has(f) && !(f in GRAFTED_SCREEN_FILES));
  if (missing.length > 0 || orphanFiles.length > 0) {
    throw new Error(
      `Textes non rangés dans dev-toolbox/shop-copy/spaces.mjs — clés : ${missing.join(", ") || "aucune"} ; fichiers : ${orphanFiles.join(", ") || "aucun"}.`,
    );
  }
}

/** Le recueil et le manifeste, tels qu'ils doivent être commités. */
export async function buildShopCopyDigest() {
  const [{ FR }, { EN }, { IT }] = await Promise.all(
    ["fr", "en", "it"].map((l) => importTs(`${COPY_DIR}/${l}.ts`)),
  );
  const dictionaries = { fr: FR, en: EN, it: IT };
  assertEverythingIsRanged(dictionaries);
  const spaces = [];
  for (const def of [...ORDER_JOURNEY, ...OTHER_SPACES]) {
    spaces.push(collectSpace(def, await loadSpace(def, dictionaries)));
  }
  const manifest = {
    generatedBy: `dev-toolbox/shop-copy-digest.mjs — ne pas éditer à la main, régénérer par \`${REGENERATE}\``,
    locales: LOCALES,
    spaces,
  };
  // Le manifeste passe par Prettier, que le hook de commit lui appliquerait ;
  // le recueil non (il est dans `.prettierignore`, cf. la raison là-bas).
  const prettierOptions = await prettier.resolveConfig(join(ROOT, MANIFEST_PATH));
  const markdown = renderDigest(spaces);
  const json = await prettier.format(JSON.stringify(manifest), {
    ...prettierOptions,
    filepath: join(ROOT, MANIFEST_PATH),
  });
  return { spaces, markdown, json };
}
