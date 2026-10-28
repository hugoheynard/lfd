import {
  SHELF_LABEL_OFF_CATALOG,
  SHELF_LABEL_UNKNOWN,
  type CatalogFamilyView,
  resupplyTitleOf,
} from "@lfd/contracts";
import type { SaleUnit } from "@lfd/money";

import type {
  ProductionLineSnapshot,
  ProductionOrderSnapshot,
  ProductionResupplySnapshot,
} from "../entities/production-day.js";
import { byPositionThenName } from "./production-worksheet-groups.js";

/**
 * **Le dossier du jour** — ce que le fournil imprime le soir de l'arrêt :
 * le récapitulatif par rayon (les fiches de poste, réassorts compris), puis
 * un bon par commande et un bon par réassort.
 *
 * C'est le même papier que l'impression de l'écran
 * (`lfd-backoffice-frontend/…/previsionnel/dossier-du-jour/`, recopié le
 * 2026-10-06 de `production-recap.ts`) : mêmes rayons dans l'ordre du
 * référentiel, le plus gros d'abord dans un rayon, à quantité égale par nom.
 * Une différence, voulue : il se lit dans ce que la journée a **figé**, pas
 * dans le lot vivant du commerce — le papier envoyé à l'arrêt doit dire ce
 * qu'on a arrêté.
 *
 * Fonction pure : les rayons sont passés par l'appelant, `null` si leur
 * lecture a échoué (tout tombe alors dans « Rayon inconnu », jamais « Hors
 * catalogue », qui affirmerait des articles retirés de la vente).
 */

/** Un produit à fabriquer, commandes et réassorts confondus. */
export interface DossierRecapLine {
  readonly sku: string;
  readonly productName: string;
  /**
   * Le TOTAL que le poste enfourne : commandes + réassorts (R3d-bis). Des
   * grammes si `saleUnit = "weight"` (P6) — un seul article, une seule unité.
   */
  readonly quantity: number;
  readonly saleUnit: SaleUnit;
  /** Sur combien de commandes il se répartit : 240 en 3 fois n'est pas 240 en 40. */
  readonly orderCount: number;
  /** Dont réassort — un détail du total, jamais à part de lui. */
  readonly resupplyQuantity: number;
}

/** Un rayon du récapitulatif — la fiche de poste. */
export interface DossierRecapGroup {
  readonly label: string;
  /** Le total du rayon en pièces, réassorts compris — un article au poids compte pour un. */
  readonly quantity: number;
  readonly resupplyQuantity: number;
  readonly lines: readonly DossierRecapLine[];
}

/** Le dossier, prêt à mettre en page. */
export interface DayDossier {
  /**
   * Les fiches de poste, par rayon : commandes + réassorts (R3d-bis, Hugo
   * 2026-10-21 — « que ça passe quand même dans le compte total »).
   */
  readonly recap: readonly DossierRecapGroup[];
  /** Un bon par commande, **par référence** : deux tirages rendent la même pile. */
  readonly sheets: readonly ProductionOrderSnapshot[];
  /** Un bon par réassort, par point puis par identifiant — même raison. */
  readonly resupplySheets: readonly ProductionResupplySnapshot[];
  /** Toutes les pièces à enfourner, réassorts compris. */
  readonly pieces: number;
  /** Dont réassort. */
  readonly resupplyPieces: number;
}

interface Tally {
  readonly productName: string;
  readonly saleUnit: SaleUnit;
  quantity: number;
  orderCount: number;
  resupplyQuantity: number;
}

/** Monte le dossier d'une journée à partir de ses commandes et réassorts figés. */
export function dayDossierOf(
  orders: readonly ProductionOrderSnapshot[],
  shelves: ReadonlyMap<string, CatalogFamilyView> | null,
  resupplies: readonly ProductionResupplySnapshot[] = [],
): DayDossier {
  const recap = recapOf(talliesOf(orders, resupplies), shelves);
  return {
    recap,
    sheets: [...orders].sort((left, right) => compareCodes(left.reference, right.reference)),
    resupplySheets: [...resupplies].sort(
      (left, right) =>
        siteLabelOf(left).localeCompare(siteLabelOf(right), "fr") ||
        compareCodes(left.resupplyId, right.resupplyId),
    ),
    pieces: recap.reduce((sum, group) => sum + group.quantity, 0),
    resupplyPieces: recap.reduce((sum, group) => sum + group.resupplyQuantity, 0),
  };
}

/** Le nom du point ; un point sans nom figé se dit par son identifiant — rien d'autre n'est sûr. */
export function siteLabelOf(resupply: ProductionResupplySnapshot): string {
  return resupply.siteLabel ?? resupply.siteId;
}

/** Le titre du bon (R1g) : « Vitrine du matin — Village », ou « Réassort Village » sans nom. */
export function resupplySheetTitleOf(resupply: ProductionResupplySnapshot): string {
  const site = siteLabelOf(resupply);
  return resupplyTitleOf(resupply.name, site, `Réassort ${site}`);
}

function talliesOf(
  orders: readonly ProductionOrderSnapshot[],
  resupplies: readonly ProductionResupplySnapshot[],
): readonly DossierRecapLine[] {
  const bySku = new Map<string, Tally>();
  const add = (line: ProductionLineSnapshot, fromOrder: boolean): void => {
    const { sku, productName, quantity, saleUnit } = line;
    const tally = bySku.get(sku) ?? {
      productName,
      saleUnit,
      quantity: 0,
      orderCount: 0,
      resupplyQuantity: 0,
    };
    bySku.set(sku, tally);
    tally.quantity += quantity;
    if (fromOrder) {
      tally.orderCount += 1;
    } else {
      tally.resupplyQuantity += quantity;
    }
  };
  for (const order of orders) {
    for (const line of order.lines) {
      add(line, true);
    }
  }
  for (const resupply of resupplies) {
    for (const line of resupply.lines) {
      add(line, false);
    }
  }
  return [...bySku].map(([sku, tally]) => ({ sku, ...tally }));
}

function recapOf(
  lines: readonly DossierRecapLine[],
  shelves: ReadonlyMap<string, CatalogFamilyView> | null,
): readonly DossierRecapGroup[] {
  const byFamily = new Map<string, { family: CatalogFamilyView; lines: DossierRecapLine[] }>();
  const unshelved: DossierRecapLine[] = [];
  for (const line of lines) {
    const family = shelves?.get(line.sku);
    if (family === undefined) {
      unshelved.push(line);
      continue;
    }
    const bucket = byFamily.get(family.id);
    if (bucket === undefined) {
      byFamily.set(family.id, { family, lines: [line] });
    } else {
      bucket.lines.push(line);
    }
  }
  const groups = [...byFamily.values()]
    .sort((left, right) => byPositionThenName(left.family, right.family))
    .map((bucket) => groupOf(bucket.family.name, bucket.lines));
  if (unshelved.length === 0) {
    return groups;
  }
  const label = shelves === null ? SHELF_LABEL_UNKNOWN : SHELF_LABEL_OFF_CATALOG;
  return [...groups, groupOf(label, unshelved)];
}

/**
 * Le plus gros d'abord — c'est par lui que le fournil commence ; à égalité, par
 * nom. Un article au poids pèse une ligne dans ce tri comme dans le total
 * (P6) : ses grammes ne se comparent pas à des pièces.
 */
function groupOf(label: string, lines: readonly DossierRecapLine[]): DossierRecapGroup {
  const sorted = [...lines].sort(
    (left, right) =>
      recapPieces(right) - recapPieces(left) ||
      left.productName.localeCompare(right.productName, "fr"),
  );
  return {
    label,
    quantity: sorted.reduce((sum, line) => sum + recapPieces(line), 0),
    resupplyQuantity: sorted.reduce((sum, line) => sum + line.resupplyQuantity, 0),
    lines: sorted,
  };
}

/**
 * Ce qu'un produit du récapitulatif pèse en pièces : ses pièces, ou — au
 * poids — une par commande qui le porte (P6). C'est la règle ligne à ligne de
 * `linePieces` sommée sur l'article, sans quoi l'en-tête du dossier et
 * l'e-mail (`dossierCountsOf`, qui compte ligne à ligne) diraient deux totaux.
 */
export function recapPieces(line: DossierRecapLine): number {
  return line.saleUnit === "weight" ? line.orderCount : line.quantity;
}

/** Ordre des codes, indépendant de la langue de l'hôte. */
function compareCodes(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}
