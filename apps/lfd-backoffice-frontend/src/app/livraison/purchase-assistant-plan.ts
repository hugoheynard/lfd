import type { PurchaseAssistantFormatView, PurchaseAssistantRowView } from '@lfd/contracts';

import { centimetres, MM_PER_CM, mmToCm } from './delivery-bins';

/**
 * Ce que l'assistant d'achat dessine et dit de la RÉPONSE du serveur
 * (`plan-geometrie-du-plancher.md`, G-D3) : le meilleur format, les bacs posés
 * sur le plancher vu de dessus, les étages et leurs libellés. Séparé de la
 * saisie (`purchase-assistant.ts`), qui ne fait que bâtir la question.
 */

/** L'index du format qui donne le plus de volume utile, ou `null` si aucun n'en donne. */
export function bestFormatIndex(formats: readonly PurchaseAssistantFormatView[]): number | null {
  let best: number | null = null;
  let bestLiters = 0;
  for (const [index, format] of formats.entries()) {
    if (format.usefulLiters > bestLiters) {
      best = index;
      bestLiters = format.usefulLiters;
    }
  }
  return best;
}

/** « 432 L » sous le mètre cube, « 1,23 m³ » au-delà. */
export function formatLiters(liters: number): string {
  const LITERS_PER_CUBIC_METER = 1000;
  if (liters < LITERS_PER_CUBIC_METER) {
    return `${liters} L`;
  }
  return `${(liters / LITERS_PER_CUBIC_METER).toFixed(2).replace('.', ',')} m³`;
}

/**
 * Un bac dessiné sur le plancher vu de dessus, en cm (le plancher en est), jeu
 * retiré. Les cotes du format arrivent en mm et ne sont converties qu'ici.
 */
export interface PlacedBin {
  readonly x: number;
  readonly y: number;
  readonly depth: number;
  readonly across: number;
  readonly turned: boolean;
}

/**
 * Les bacs de chaque rangée rendue par le serveur, centrés dans la largeur.
 * Un passage de roue est symétrique : centrer une rangée qui le touche la
 * garde entre les deux.
 */
export function placeBins(
  rows: readonly PurchaseAssistantRowView[],
  outer: { readonly lengthMm: number; readonly widthMm: number },
  floorWidthCm: number,
  gapCm: number,
): readonly PlacedBin[] {
  return rows.flatMap((row) => {
    const turned = row.orientation === 'turned';
    const across = mmToCm(turned ? outer.lengthMm : outer.widthMm) + gapCm;
    const top = (floorWidthCm - row.count * across) / 2;
    return Array.from({ length: row.count }, (_, index) => ({
      x: row.fromCm + gapCm / 2,
      y: top + index * across + gapCm / 2,
      depth: Math.max(1, row.depthCm - gapCm),
      across: Math.max(1, across - gapCm),
      turned,
    }));
  });
}

/** Une bande latérale d'une rangée sur passage : là où des bacs sont empilés au-dessus. */
export interface OverArchBand {
  readonly x: number;
  readonly y: number;
  readonly depth: number;
  readonly across: number;
}

/**
 * Les bandes latérales des rangées qui portent des bacs au-dessus des passages
 * de roue (G-D2 bis) : de chaque côté, la largeur que les colonnes centrales
 * laissent libre au sol. Les bacs eux-mêmes ne sont pas dessinés — seulement
 * la place qu'ils prennent, à un étage que le plan de dessus ne montre pas.
 */
export function overArchBands(
  rows: readonly PurchaseAssistantRowView[],
  outer: { readonly lengthMm: number; readonly widthMm: number },
  floorWidthCm: number,
  gapCm: number,
): readonly OverArchBand[] {
  return rows
    .filter((row) => row.overArchCount > 0)
    .flatMap((row) => {
      const across = mmToCm(row.orientation === 'turned' ? outer.lengthMm : outer.widthMm) + gapCm;
      const side = Math.max(0, (floorWidthCm - row.count * across) / 2);
      return [
        { x: row.fromCm, y: 0, depth: row.depthCm, across: side },
        { x: row.fromCm, y: floorWidthCm - side, depth: row.depthCm, across: side },
      ];
    });
}

/** Le premier étage (0 = le sol) où commencent les bacs au-dessus des passages, ou `null`. */
export function overArchFirstLevel(rows: readonly PurchaseAssistantRowView[]): number | null {
  const levels = rows
    .filter((row) => row.overArchCount > 0)
    .map((row) => row.overArchFromLevel)
    .filter((level): level is number => level !== null);
  return levels.length === 0 ? null : Math.min(...levels);
}

/**
 * « 12,5 cm libres au-dessus » : le plafond moins les étages — le bac mesuré
 * en mm, le plancher en cm.
 */
export function freeAboveLabel(floorHeightCm: number, levels: number, binHeightMm: number): string {
  return `${centimetres(floorHeightCm * MM_PER_CM - levels * binHeightMm)} cm libres au-dessus`;
}

/**
 * « 16 au sol × 6 étages », et « + 8 au-dessus des passages » dès que des bacs
 * latéraux s'ajoutent : le total n'est plus alors le produit des deux.
 */
export function resultSubtitle(view: PurchaseAssistantFormatView): string {
  const levels = `${view.levels} étage${view.levels > 1 ? 's' : ''}`;
  const base = `${view.floorCount} au sol × ${levels}`;
  const overArch = view.total - view.floorCount * view.levels;
  return overArch > 0 ? `${base} + ${overArch} au-dessus des passages` : base;
}
