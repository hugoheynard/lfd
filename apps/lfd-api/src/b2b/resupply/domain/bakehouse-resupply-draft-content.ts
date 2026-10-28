import {
  BlankBakehouseResupplyDraftSkuError,
  DuplicateBakehouseResupplyDraftLineError,
  EmptyBakehouseResupplyDraftError,
  TooManyBakehouseResupplyDraftLinesError,
} from "./bakehouse-resupply-draft-errors.js";
import { resupplyNameOf } from "./resupply-name.js";
import { InvalidRequestedQuantityError } from "./site-resupply-errors.js";
import type { ResupplyTarget } from "./site-resupply-snapshot.js";

/** Au plus 200 articles par brouillon — la borne du contrat. */
export const BAKEHOUSE_DRAFT_MAX_LINES = 200;

/** Une ligne de brouillon : un article et sa quantité, sans libellé. */
export interface BakehouseResupplyDraftLine {
  readonly sku: string;
  readonly quantity: number;
}

/**
 * **Ce que compose l'écran** : un point, une visée, un nom, des lignes. Sans
 * journée — elle se calcule à l'envoi, depuis la visée et l'instant.
 */
export interface BakehouseResupplyDraftContent {
  readonly siteId: string;
  readonly target: ResupplyTarget;
  readonly name: string | null;
  readonly lines: readonly BakehouseResupplyDraftLine[];
}

/**
 * Le contenu validé : le nom suit la règle des réassorts (`resupplyNameOf`),
 * au moins une ligne et au plus {@link BAKEHOUSE_DRAFT_MAX_LINES}, des
 * quantités entières > 0, et un même article deux fois est REFUSÉ — l'écran
 * envoie une quantité par article, un doublon dit une erreur de l'écran.
 * Les SKU ne sont pas lus au catalogue : un article retiré se refuse à
 * l'envoi, pour qu'un brouillon reste toujours rouvrable.
 */
export function draftContentOf(
  input: BakehouseResupplyDraftContent,
): BakehouseResupplyDraftContent {
  if (input.lines.length === 0) {
    throw new EmptyBakehouseResupplyDraftError();
  }
  if (input.lines.length > BAKEHOUSE_DRAFT_MAX_LINES) {
    throw new TooManyBakehouseResupplyDraftLinesError(BAKEHOUSE_DRAFT_MAX_LINES);
  }
  const seen = new Set<string>();
  const lines = input.lines.map((line) => {
    const sku = line.sku.trim();
    if (sku === "") {
      throw new BlankBakehouseResupplyDraftSkuError();
    }
    if (!Number.isInteger(line.quantity) || line.quantity < 1) {
      throw new InvalidRequestedQuantityError(line.quantity);
    }
    if (seen.has(sku)) {
      throw new DuplicateBakehouseResupplyDraftLineError(sku);
    }
    seen.add(sku);
    return { sku, quantity: line.quantity };
  });
  return {
    siteId: input.siteId,
    target: input.target,
    name: resupplyNameOf(input.name),
    lines,
  };
}
