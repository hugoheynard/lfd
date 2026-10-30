import type {
  BackfillReportLine,
  DriftedOrder,
} from "../src/b2b/orders/infrastructure/prisma-order-discount-backfill.js";
import { refuseNonLocalTarget } from "./local-target.js";

/**
 * **Les options de la reprise des remises, et son rapport** — plan
 * `documentation/pricing/plan-promotions-par-audience-et-acheminement.md`,
 * § 18.3 (Q-M1, décidée le 2026-10-30). Pur : le script les lit, les tests
 * les éprouvent sans base.
 */
export interface BackfillOptions {
  /** À blanc par défaut : `--write` seul écrit. */
  readonly write: boolean;
  /** Le nom de base retapé après `--production`, ou `null` (cible locale seulement). */
  readonly production: string | null;
}

const USAGE =
  "Usage : backfill:order-discounts [--write] [--production <nom de la base>]. " +
  "À blanc par défaut ; --write après lecture du compte.";

/** @throws {Error} une option inconnue, ou `--production` sans nom de base. */
export function parseBackfillArgs(argv: readonly string[]): BackfillOptions {
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
 * Sans `--production`, la cible doit être locale (`refuseNonLocalTarget`).
 * Avec, le nom retapé doit être celui de la base de l'URL : c'est le geste
 * qui prouve qu'on sait où l'on écrit.
 *
 * @throws {Error} cible refusée.
 */
export function assertBackfillTarget(url: string, options: BackfillOptions): void {
  if (options.production === null) {
    refuseNonLocalTarget(
      url,
      "la reprise écrit les remises des commandes ; une base distante exige --production <nom de la base>.",
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

/** Le rapport, en lignes : les comptes, puis chaque commande qui demande un regard. */
export function backfillReport(
  lines: readonly BackfillReportLine[],
  drifted: readonly DriftedOrder[],
  write: boolean,
): readonly string[] {
  const count = (kind: BackfillReportLine["outcome"]["kind"]): number =>
    lines.filter((line) => line.outcome.kind === kind).length;
  const out = [
    write ? "Reprise des remises — ÉCRITURE" : "Reprise des remises — À BLANC (rien n'est écrit)",
    `  ${lines.length} commande(s) remisée(s) sans remise active`,
    `  computed ${count("computed")} · frozen ${count("frozen")} · à trancher ${count("undecided")} · ` +
      `illisibles ${count("unreadable")} · reprises entre-temps ${count("already")}`,
  ];
  for (const line of lines) {
    const detail = detailOf(line);
    if (detail !== null) {
      out.push(`  ${line.orderNumber} — ${detail}`);
    }
  }
  if (drifted.length > 0) {
    out.push(
      `  ${drifted.length} commande(s) dont les remises actives ne somment plus discount_cents :`,
    );
    for (const order of drifted) {
      out.push(
        `  ${order.orderNumber} — remises actives ${order.activeCents} c, discount_cents ${order.discountCents} c`,
      );
    }
  }
  return out;
}

function detailOf(line: BackfillReportLine): string | null {
  const { outcome } = line;
  switch (outcome.kind) {
    case "frozen":
      return `frozen : ${outcome.gap ?? "écart"}`;
    case "undecided":
      return `à trancher (rien d'écrit) : ${outcome.reason}`;
    case "unreadable":
      return `illisible (rien d'écrit) : ${outcome.reason}`;
    default:
      return null;
  }
}
