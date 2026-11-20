import type { SheetMoney } from '@lfd/contracts';

import { formatCents } from './order-format';

/** La largeur d'une ligne du décompte texte, celle des remises. */
const LINE_WIDTH = 42;

/** Le libellé quand la livraison est offerte par le franco de la route. */
const FREE_DELIVERY_LABEL = 'Livraison offerte';

/**
 * **La livraison offerte au bon texte** — la forme du bon PDF : la livraison
 * au barème offert (`deliveryLabel`, le mot de la ligne de port du décompte),
 * puis « Livraison offerte » (ou le libellé français figé de la promotion) au
 * même montant, négatif. AFFICHÉE, pas comptable : aucun total n'en dépend.
 *
 * `ttc` : le ticket écrit le TTC figé ; une commande qui n'en porte pas écrit
 * le HT et le dit.
 */
export function freeDeliveryTextLines(
  money: SheetMoney,
  deliveryLabel: string,
  ttc: boolean,
): readonly string[] {
  const free = money.freeDelivery;
  if (free === undefined || free.waivedCents <= 0) {
    return [];
  }
  const cents = ttc ? (free.waivedTtcCents ?? free.waivedCents) : free.waivedCents;
  const suffix = ttc && free.waivedTtcCents === null ? ' (HT)' : '';
  return [
    textLine(`${deliveryLabel}${suffix}`, formatCents(cents)),
    textLine(`${free.label?.fr ?? FREE_DELIVERY_LABEL}${suffix}`, `−${formatCents(cents)}`),
  ];
}

function textLine(label: string, value: string): string {
  const head = `  ${label.padEnd(12, ' ')}  `;
  return `${head}${value.padStart(Math.max(value.length, LINE_WIDTH - head.length), ' ')}`;
}
