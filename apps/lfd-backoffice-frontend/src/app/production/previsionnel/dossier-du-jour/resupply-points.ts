import type { ProductionDayResupply } from '@lfd/contracts';

/** Un produit pour un point. */
export interface ResupplyPointLine {
  readonly sku: string;
  readonly productName: string;
  readonly quantity: number;
}

/** Les réassorts d'un point, fusionnés par produit. */
export interface ResupplyPoint {
  readonly siteId: string;
  readonly label: string;
  readonly quantity: number;
  readonly lines: readonly ResupplyPointLine[];
}

/**
 * **La section « Réassorts » du dossier** (lot R3d) — le même rangement que
 * le PDF du serveur (`production/domain/services/day-dossier.ts`) : un bloc
 * par point, par nom ; deux réassorts d'un même point fusionnés ; dans un
 * point, le plus gros d'abord, à égalité par nom. Un point sans nom se dit par
 * son identifiant.
 */
export function resupplyPointsOf(
  resupplies: readonly ProductionDayResupply[],
): readonly ResupplyPoint[] {
  const bySite = new Map<string, { label: string; bySku: Map<string, ResupplyPointLine> }>();
  for (const resupply of resupplies) {
    const site = bySite.get(resupply.siteId) ?? {
      label: resupply.siteLabel ?? resupply.siteId,
      bySku: new Map<string, ResupplyPointLine>(),
    };
    bySite.set(resupply.siteId, site);
    for (const line of resupply.lines) {
      const known = site.bySku.get(line.sku);
      site.bySku.set(line.sku, {
        sku: line.sku,
        productName: line.productName,
        quantity: (known?.quantity ?? 0) + line.quantity,
      });
    }
  }
  return [...bySite]
    .map(([siteId, site]) => {
      const lines = [...site.bySku.values()].sort(
        (left, right) =>
          right.quantity - left.quantity || left.productName.localeCompare(right.productName, 'fr'),
      );
      const quantity = lines.reduce((sum, line) => sum + line.quantity, 0);
      return { siteId, label: site.label, quantity, lines };
    })
    .sort((left, right) => left.label.localeCompare(right.label, 'fr'));
}

/** Toutes les pièces de réassort de la journée. */
export function resupplyPiecesOf(points: readonly ResupplyPoint[]): number {
  return points.reduce((sum, point) => sum + point.quantity, 0);
}
