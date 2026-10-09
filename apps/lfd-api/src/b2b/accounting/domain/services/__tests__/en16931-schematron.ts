import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import SaxonJS from "saxon-js";

/**
 * **Le Schematron EN 16931 (syntaxe CII) rejoué dans les specs** — release
 * officielle ConnectingEurope `validation-1.3.16` (avril 2026), commitée en
 * XSLT sous `test/fixtures/en16931-cii/` (EUPL 1.2).
 *
 * `saxon-js` n'exécute qu'une feuille COMPILÉE (SEF, 5 Mo) : elle n'est pas
 * commitée, elle est compilée une fois par le binaire `xslt3` du paquet dans
 * un cache non suivi, nommé par l'empreinte de l'XSLT — une nouvelle release
 * déposée recompile d'elle-même. Aucun réseau : tout part du fichier commité.
 */

const APP_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  ...Array.from({ length: 6 }, () => ".."),
);
const XSLT_PATH = join(APP_ROOT, "test", "fixtures", "en16931-cii", "EN16931-CII-validation.xslt");
const CACHE_DIRECTORY = join(APP_ROOT, "node_modules", ".cache", "en16931-cii");

/** La première compilation prend ~6 s ; les suivantes lisent le cache. */
export const SCHEMATRON_COMPILE_TIMEOUT_MS = 120_000;

/** Un `svrl:failed-assert` : une règle EN 16931 que le document enfreint. */
export interface SchematronFailure {
  /** `BR-CO-10`, `BR-S-08`… — l'identifiant de la règle. */
  readonly id: string;
  /** `fatal` (refus) ou `warning`. */
  readonly flag: string;
  readonly text: string;
  /** Le chemin XPath de l'élément en faute. */
  readonly location: string;
}

/** Compile le SEF s'il manque, et rend son chemin. */
export function compiledSchematron(): string {
  const digest = createHash("sha256").update(readFileSync(XSLT_PATH)).digest("hex");
  const sef = join(CACHE_DIRECTORY, `${digest}.sef.json`);
  if (existsSync(sef)) {
    return sef;
  }
  mkdirSync(CACHE_DIRECTORY, { recursive: true });
  const partial = `${sef}.${String(process.pid)}.tmp`;
  const xslt3 = createRequire(import.meta.url).resolve("xslt3/xslt3.js");
  const run = spawnSync(
    process.execPath,
    [xslt3, `-xsl:${XSLT_PATH}`, `-export:${partial}`, "-nogo", "-relocate:on"],
    { encoding: "utf8", timeout: SCHEMATRON_COMPILE_TIMEOUT_MS },
  );
  if (run.status !== 0 || !existsSync(partial)) {
    throw new Error(
      `La compilation du Schematron EN 16931 a échoué (code ${String(run.status)}) : ${run.stderr}`,
    );
  }
  // Renommage atomique : deux workers Jest peuvent compiler en même temps.
  renameSync(partial, sef);
  return sef;
}

/** Passe un XML CII au Schematron et rend chaque règle enfreinte. */
export function schematronFailures(xml: string): readonly SchematronFailure[] {
  const svrl = SaxonJS.transform(
    { stylesheetFileName: compiledSchematron(), sourceText: xml, destination: "serialized" },
    "sync",
  ).principalResult;
  return [...svrl.matchAll(FAILED_ASSERT)].map((match) => ({
    id: attribute(match[1] ?? "", "id"),
    flag: attribute(match[1] ?? "", "flag"),
    location: attribute(match[1] ?? "", "location"),
    text: unescape(/<svrl:text>([\s\S]*?)<\/svrl:text>/u.exec(match[2] ?? "")?.[1] ?? "").trim(),
  }));
}

/** Les seules règles de refus : un document conforme n'en a aucune. */
export function fatalFailures(xml: string): readonly SchematronFailure[] {
  return schematronFailures(xml).filter((failure) => failure.flag === "fatal");
}

const FAILED_ASSERT = /<svrl:failed-assert\b([^>]*)>([\s\S]*?)<\/svrl:failed-assert>/gu;

function attribute(attributes: string, name: string): string {
  return unescape(new RegExp(`\\b${name}="([^"]*)"`, "u").exec(attributes)?.[1] ?? "");
}

function unescape(text: string): string {
  return text
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}
