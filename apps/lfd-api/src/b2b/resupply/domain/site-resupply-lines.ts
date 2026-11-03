import {
  ResupplyLineNotInDraftError,
  TooManySiteResupplyLinesError,
} from "./site-resupply-errors.js";
import { ResupplyLineUnitMismatchError } from "./resupply-sale-unit-errors.js";
import type { SiteResupplyLine } from "./site-resupply-line.js";

/**
 * **Les lignes d'une demande en cours** — les règles de composition de
 * `SiteResupply`, sorties de l'agrégat pour qu'il tienne en un fichier
 * (dette du réassort, 2026-11-02). Pures : elles rendent une liste neuve,
 * l'agrégat seul décide quand les appliquer (jamais après l'envoi).
 */

/**
 * Le plus d'articles qu'une demande porte — la borne du brouillon du fournil
 * (`BAKEHOUSE_DRAFT_MAX_LINES`, 200), pour qu'un envoi du fournil et une
 * demande du comptoir se lisent avec la même mesure.
 */
export const SITE_RESUPPLY_MAX_LINES = 200;

/**
 * Ajoute un article. Déjà présent, sa quantité s'ADDITIONNE : deux postes
 * qui ajoutent des croissants en demandent la somme — dans la même unité
 * seulement (L2b-1).
 *
 * @throws {ResupplyLineUnitMismatchError} déjà présent dans l'autre unité.
 * @throws {TooManySiteResupplyLinesError} un article de plus que la borne.
 */
export function withLineAdded(
  lines: readonly SiteResupplyLine[],
  line: SiteResupplyLine,
): readonly SiteResupplyLine[] {
  const existing = lines.find((candidate) => candidate.sku === line.sku);
  if (existing === undefined) {
    if (lines.length >= SITE_RESUPPLY_MAX_LINES) {
      throw new TooManySiteResupplyLinesError(SITE_RESUPPLY_MAX_LINES);
    }
    return [...lines, line];
  }
  if (existing.saleUnit !== line.saleUnit) {
    throw new ResupplyLineUnitMismatchError(existing.sku, existing.label);
  }
  const summed = existing.withQuantity(existing.quantity + line.quantity);
  return lines.map((candidate) => (candidate.sku === line.sku ? summed : candidate));
}

/** Remplace la quantité d'un article (entière, un ou plus). */
export function withLineCorrected(
  lines: readonly SiteResupplyLine[],
  sku: string,
  quantity: number,
): readonly SiteResupplyLine[] {
  const corrected = lineOf(lines, sku).withQuantity(quantity);
  return lines.map((candidate) => (candidate.sku === sku ? corrected : candidate));
}

/** Retire un article. */
export function withLineWithdrawn(
  lines: readonly SiteResupplyLine[],
  sku: string,
): readonly SiteResupplyLine[] {
  lineOf(lines, sku);
  return lines.filter((candidate) => candidate.sku !== sku);
}

/** @throws {ResupplyLineNotInDraftError} l'article n'est pas dans la demande. */
function lineOf(lines: readonly SiteResupplyLine[], sku: string): SiteResupplyLine {
  const line = lines.find((candidate) => candidate.sku === sku);
  if (line === undefined) {
    throw new ResupplyLineNotInDraftError(sku);
  }
  return line;
}
