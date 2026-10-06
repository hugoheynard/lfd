import {
  SHELF_LABEL_OFF_CATALOG,
  SHELF_LABEL_UNKNOWN,
  type CatalogFamilyView,
} from "@lfd/contracts";

import type { ProductionOrderSnapshot } from "../entities/production-day.js";
import { byPositionThenName } from "./production-worksheet-groups.js";

/**
 * **Le dossier du jour** — ce que le fournil imprime le soir de l'arrêt :
 * le récapitulatif par rayon, puis un bon par commande.
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

/** Un produit à fabriquer, tous bons confondus. */
export interface DossierRecapLine {
  readonly sku: string;
  readonly productName: string;
  readonly quantity: number;
  /** Sur combien de commandes il se répartit : 240 en 3 fois n'est pas 240 en 40. */
  readonly orderCount: number;
}

/** Un rayon du récapitulatif. */
export interface DossierRecapGroup {
  readonly label: string;
  readonly quantity: number;
  readonly lines: readonly DossierRecapLine[];
}

/** Le dossier, prêt à mettre en page. */
export interface DayDossier {
  readonly recap: readonly DossierRecapGroup[];
  /** Un bon par commande, **par référence** : deux tirages rendent la même pile. */
  readonly sheets: readonly ProductionOrderSnapshot[];
  readonly pieces: number;
}

interface Tally {
  readonly productName: string;
  quantity: number;
  orderCount: number;
}

/** Monte le dossier d'une journée à partir de ses commandes figées. */
export function dayDossierOf(
  orders: readonly ProductionOrderSnapshot[],
  shelves: ReadonlyMap<string, CatalogFamilyView> | null,
): DayDossier {
  const recap = recapOf(talliesOf(orders), shelves);
  return {
    recap,
    sheets: [...orders].sort((left, right) => compareCodes(left.reference, right.reference)),
    pieces: recap.reduce((sum, group) => sum + group.quantity, 0),
  };
}

function talliesOf(orders: readonly ProductionOrderSnapshot[]): readonly DossierRecapLine[] {
  const bySku = new Map<string, Tally>();
  for (const order of orders) {
    for (const line of order.lines) {
      const tally = bySku.get(line.sku);
      if (tally === undefined) {
        bySku.set(line.sku, {
          productName: line.productName,
          quantity: line.quantity,
          orderCount: 1,
        });
      } else {
        tally.quantity += line.quantity;
        tally.orderCount += 1;
      }
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

/** Le plus gros d'abord — c'est par lui que le fournil commence ; à égalité, par nom. */
function groupOf(label: string, lines: readonly DossierRecapLine[]): DossierRecapGroup {
  const sorted = [...lines].sort(
    (left, right) =>
      right.quantity - left.quantity || left.productName.localeCompare(right.productName, "fr"),
  );
  return { label, quantity: sorted.reduce((sum, line) => sum + line.quantity, 0), lines: sorted };
}

/** Ordre des codes, indépendant de la langue de l'hôte. */
function compareCodes(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}
