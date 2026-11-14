import type { OpenerBackfillLine } from "../src/lafoliecoffee/account/infrastructure/company-opener-backfill-plan.js";
import { refuseNonLocalTarget } from "./local-target.js";

/**
 * **Les options de la reprise de l'auteur des fiches, et son rapport** —
 * `documentation/b2b/plan-suivi-commercial.md`, § 3.1. Pur : le script les
 * lit, les tests les éprouvent sans base.
 */
export interface OpenerBackfillOptions {
  /** À blanc par défaut : `--write` seul écrit. */
  readonly write: boolean;
  /** Le nom de base retapé après `--production`, ou `null` (cible locale seulement). */
  readonly production: string | null;
}

const USAGE =
  "Usage : backfill:company-openers [--write] [--production <nom de la base>]. " +
  "À blanc par défaut ; --write après lecture du compte.";

/** @throws {Error} une option inconnue, ou `--production` sans nom de base. */
export function parseOpenerBackfillArgs(argv: readonly string[]): OpenerBackfillOptions {
  let write = false;
  let production: string | null = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--") {
      continue;
    }
    if (arg === "--write") {
      write = true;
    } else if (arg === "--production") {
      const name = argv[i + 1];
      if (name === undefined || name.startsWith("--") || name === "") {
        throw new Error(`--production exige le nom de la base, retapé. ${USAGE}`);
      }
      production = name;
      i += 1;
    } else {
      throw new Error(`Option inconnue « ${String(arg)} ». ${USAGE}`);
    }
  }
  return { write, production };
}

/**
 * Sans `--production`, la cible doit être locale. Avec, le nom retapé doit
 * être celui de la base de l'URL : c'est le geste qui prouve qu'on sait où
 * l'on écrit.
 *
 * @throws {Error} cible refusée.
 */
export function assertOpenerBackfillTarget(url: string, options: OpenerBackfillOptions): void {
  if (options.production === null) {
    refuseNonLocalTarget(
      url,
      "la reprise écrit l'auteur des fiches clients ; une base distante exige --production <nom de la base>.",
    );
    return;
  }
  if (url === "") {
    throw new Error("DATABASE_LFD_URL manquant : aucune cible.");
  }
  const database = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
  if (database !== options.production) {
    throw new Error(
      `Nom de base retapé « ${options.production} », cible « ${database} » : rien n'est lancé. ` +
        "Retapez le nom exact de la base visée par DATABASE_LFD_URL.",
    );
  }
}

/** Les mots du rapport pour chaque raison de ne rien écrire. */
const SKIP_WORDS = {
  "no-declaration": "aucun fait company.declared au journal",
  "not-staff": "déclarée par le client ou le système",
  "no-actor": "fait staff sans acteur (auteur inconnu)",
  "unresolved-sub": "acteur resté un sub Auth0, sans fiche staff",
} as const;

/**
 * Le rapport, en lignes : d'abord combien de déclarations staff portent un
 * acteur (à lire avant d'écrire), puis les comptes, puis chaque fiche.
 */
export function openerBackfillReport(
  coverage: { readonly staff: number; readonly withActor: number },
  lines: readonly OpenerBackfillLine[],
  written: number | null,
): readonly string[] {
  const fills = lines.filter((line) => line.kind === "fill");
  const out = [
    written === null
      ? "Reprise de l'auteur des fiches — À BLANC (rien n'est écrit)"
      : "Reprise de l'auteur des fiches — ÉCRITURE",
    `  ${coverage.staff} déclaration(s) staff au journal pour ces fiches, dont ${coverage.withActor} avec un acteur`,
    `  ${lines.length} fiche(s) principale(s) sans auteur · ${fills.length} à remplir · ${lines.length - fills.length} laissée(s) vide(s)`,
  ];
  if (written !== null) {
    out.push(`  ${written} écrite(s) ; les autres l'avaient été entre-temps`);
  }
  for (const line of lines) {
    out.push(
      line.kind === "fill"
        ? `  ${line.reference} — auteur ${line.declaredByStaffId} (${line.declaredByName ?? "nom inconnu"})` +
            (line.followedByStaffId === null ? ", suiveur déjà posé" : ", suivie par lui")
        : `  ${line.reference} — vide : ${SKIP_WORDS[line.reason]}`,
    );
  }
  return out;
}
