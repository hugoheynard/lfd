import {
  BlankBakehouseResupplyDraftSkuError,
  DuplicateBakehouseResupplyDraftLineError,
  EmptyBakehouseResupplyDraftError,
  TooManyBakehouseResupplyDraftLinesError,
} from "./bakehouse-resupply-draft-errors.js";
import { resupplyNameOf } from "./resupply-name.js";
import {
  RESUPPLY_LIST_MAX_LINES,
  type ResupplyListLine,
  type ResupplyListRefusals,
  resupplyListOf,
} from "./resupply-line-list.js";
import type { SaleUnit } from "./resupply-sale-unit.js";
import type { ResupplyTarget } from "./site-resupply-snapshot.js";

const PIECE: SaleUnit = "piece";

/** Au plus 200 articles par brouillon — la borne du contrat. */
export const BAKEHOUSE_DRAFT_MAX_LINES = RESUPPLY_LIST_MAX_LINES;

/**
 * Une ligne de brouillon : un article, sa quantité et son unité, sans libellé.
 * Au poids, la quantité compte des grammes (L2b-1).
 */
export type BakehouseResupplyDraftLine = ResupplyListLine;

/**
 * Une ligne telle que l'écran ou la base la donnent, l'unité lue : absente,
 * c'est la pièce — tout brouillon écrit avant (L2b-1) l'était, et le
 * contrat (`bakehouseResupplyDraftLineSchema`) le dit. À l'envoi, l'unité
 * est confrontée au catalogue (`catalogueLine`).
 */
export function draftLineOf(line: {
  readonly sku: string;
  readonly quantity: number;
  readonly saleUnit?: SaleUnit | undefined;
}): BakehouseResupplyDraftLine {
  return { sku: line.sku, quantity: line.quantity, saleUnit: line.saleUnit ?? PIECE };
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

const DRAFT_REFUSALS: ResupplyListRefusals = {
  empty: () => new EmptyBakehouseResupplyDraftError(),
  tooMany: (max) => new TooManyBakehouseResupplyDraftLinesError(max),
  blankSku: () => new BlankBakehouseResupplyDraftSkuError(),
  duplicate: (sku) => new DuplicateBakehouseResupplyDraftLineError(sku),
};

/**
 * Le contenu validé : le nom suit la règle des réassorts (`resupplyNameOf`),
 * les lignes celle d'une composition ({@link resupplyListOf}) sous les refus
 * du brouillon. Les SKU ne sont pas lus au catalogue : un article retiré se
 * refuse à l'envoi, pour qu'un brouillon reste toujours rouvrable.
 */
export function draftContentOf(
  input: BakehouseResupplyDraftContent,
): BakehouseResupplyDraftContent {
  return {
    siteId: input.siteId,
    target: input.target,
    name: resupplyNameOf(input.name),
    lines: resupplyListOf(input.lines, DRAFT_REFUSALS),
  };
}
