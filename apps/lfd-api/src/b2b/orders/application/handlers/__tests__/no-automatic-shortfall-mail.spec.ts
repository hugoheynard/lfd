import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * **Avertir le client d'un départ incomplet est un choix du décideur, jamais
 * un envoi automatique** (Hugo, `documentation/commandes/modification/commandes-incompletes.md`
 * § 4, G3 ; plan `documentation/commandes/plan-e6d-ecrire-au-client.md` § 1).
 *
 * Le seul chemin vers le client est le geste « Écrire au client »
 * (`WriteShortfallLetterHandler`). Ce test lit les SOURCES : aucun abonné au
 * manque signalé, à la décision ou à la remise, ni rien dans les bons de
 * livraison, ne prend le mailer.
 *
 * Limite assumée : il lit le fichier de l'abonné, pas ce qu'il déclenche par
 * le bus. Un abonné qui enverrait par une commande intermédiaire lui
 * échapperait — la commande, elle, se verrait à la relecture.
 */

const SRC = join(process.cwd(), "src");

/** Les faits dont aucun abonné n'écrit au client. */
const SILENT_FACTS = [
  "PACKING_SHORTFALL_REPORTED",
  "PACKING_SHORTFALL_CLEARED",
  "ORDER_SHORTFALL_DECIDED",
  "HANDOVER_HANDED_OVER",
  "ORDER_FULFILLED",
] as const;

/** Le contexte des bons de livraison : rien n'y écrit au client. */
const SILENT_CONTEXT = join(SRC, "b2b", "delivery-notes");

function sourceFiles(directory: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "__tests__" ? [] : sourceFiles(path);
    }
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".spec.ts") ? [path] : [];
  });
}

/** Sans les commentaires : une phrase qui cite le mailer ne doit ni satisfaire ni échouer. */
function codeOf(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .replace(/^\s*\/\/.*$/gmu, "");
}

function listensToSilentFact(code: string): boolean {
  return SILENT_FACTS.some((fact) =>
    new RegExp(`@DurableHandler\\(\\{[^}]*type:\\s*${fact}\\b`, "u").test(code),
  );
}

const takesTheMailer = (code: string): boolean =>
  code.includes("mailer.tokens.js") || /\bMAILER\b/u.test(code);

const ALL = sourceFiles(SRC);
const SUBSCRIBERS = ALL.filter((path) => listensToSilentFact(codeOf(path)));
const DELIVERY_NOTES = ALL.filter((path) => path.startsWith(SILENT_CONTEXT));

describe("aucun courriel automatique sur un départ incomplet (E6d)", () => {
  it("trouve bien les abonnés et les bons de livraison qu'il garde", () => {
    // Une liste vide rendrait la suite verte sans rien prouver.
    expect(SUBSCRIBERS.length).toBeGreaterThanOrEqual(SILENT_FACTS.length);
    expect(DELIVERY_NOTES.length).toBeGreaterThan(0);
  });

  it("aucun abonné au manque, à la décision ni à la remise ne prend le mailer", () => {
    const offenders = SUBSCRIBERS.filter((path) => takesTheMailer(codeOf(path)));

    expect(offenders.map((path) => relative(SRC, path))).toEqual([]);
  });

  it("rien dans les bons de livraison ne prend le mailer", () => {
    const offenders = DELIVERY_NOTES.filter((path) => takesTheMailer(codeOf(path)));

    expect(offenders.map((path) => relative(SRC, path))).toEqual([]);
  });
});
