import {
  describePolicyBackfill,
  type PolicyBackfillDecision,
} from "../src/b2b/pricing/domain/services/promotion-policy-backfill.js";
import { refuseNonLocalTarget } from "./local-target.js";

/**
 * **Les options de la reprise des politiques de promotions, et son rapport**
 * (`documentation/promotions/plan-la-mercuriale-decide.md`, § 8). Pur : le
 * script les lit, les tests les éprouvent sans base.
 */
export interface PolicyBackfillOptions {
  /** À blanc par défaut : `--write` seul écrit. */
  readonly write: boolean;
  /** Le nom de base retapé après `--production`, ou `null` (cible locale seulement). */
  readonly production: string | null;
}

const USAGE =
  "Usage : backfill:mercuriale-promotion-policies [--write] [--production <nom de la base>]. " +
  "À blanc par défaut ; --write après lecture du compte.";

/** @throws {Error} une option inconnue, ou `--production` sans nom de base. */
export function parsePolicyBackfillArgs(argv: readonly string[]): PolicyBackfillOptions {
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
 * être celui de la base de l'URL.
 *
 * @throws {Error} cible refusée.
 */
export function assertPolicyBackfillTarget(url: string, options: PolicyBackfillOptions): void {
  if (options.production === null) {
    refuseNonLocalTarget(
      url,
      "la reprise écrit la politique de promotions des mercuriales ; une base distante exige --production <nom de la base>.",
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

/** Le rapport : les comptes, puis chaque mercuriale ou brouillon. */
export function policyBackfillReport(
  decisions: readonly PolicyBackfillDecision[],
  written: ReadonlySet<string>,
  write: boolean,
): readonly string[] {
  const count = (outcome: PolicyBackfillDecision["outcome"]): number =>
    decisions.filter((decision) => decision.outcome === outcome).length;
  const lines = [
    write
      ? "Reprise des politiques de promotions — ÉCRITURE"
      : "Reprise des politiques de promotions — À BLANC (rien n'est écrit)",
    `  ${decisions.length} mercuriale(s) en cours ou à venir et brouillon(s)`,
    `  au choix ${count("set")} · aucune ${count("none")} · déjà réglées ${count("decided")}`,
  ];
  for (const decision of decisions) {
    const missed =
      write && decision.outcome === "set" && !written.has(decision.target.id)
        ? " (changée entre-temps : non écrite)"
        : "";
    lines.push(`  ${describePolicyBackfill(decision)}${missed}`);
  }
  return lines;
}
