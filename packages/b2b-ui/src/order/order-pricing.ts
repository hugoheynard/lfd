import type { OrderLineView, OrderView } from '@lfd/contracts';

import { formatAdjustment, formatCents, formatLateFeeTerms } from './order-format';

/**
 * **La trace du prix, telle qu'une ligne de commande la porte.**
 *
 * Des fonctions pures, à part du composant : dériver « quel était le tarif
 * d'entrée » est de l'arithmétique de lecture, et l'arithmétique se teste sans
 * monter un gabarit.
 *
 * Rien ici ne CALCULE un prix. La résolution a eu lieu à la passation, côté
 * serveur, et son résultat est figé sur la ligne : ce module ne fait que relire
 * ce qui y est écrit. Recalculer quoi que ce soit ici donnerait une seconde
 * version de la vérité, et celle qu'on regarderait le moins finirait par
 * contredire la facture.
 */

/**
 * Le tarif **d'entrée** de la ligne, s'il diffère de ce qui a été facturé.
 *
 * `null` dans deux cas qu'il ne faut pas confondre à l'écran, mais qui se
 * traitent pareil — il n'y a rien à barrer :
 *
 * - aucune règle n'a joué, donc le prix affiché EST le tarif d'entrée ;
 * - la ligne ne porte aucune trace : une commande antérieure au gel de la trace,
 *   ou une ligne fabriquée par un import. L'absence est rendue telle quelle
 *   plutôt qu'inventée.
 */
export function entryPriceOf(line: OrderLineView): number | null {
  const base = line.pricing?.basePriceMillicents ?? null;
  return base === null || base === line.unitPriceMillicents ? null : base;
}

/**
 * Les libellés des étages qui ont produit un effet, dans l'ordre.
 *
 * Le libellé est **destiné au client** — c'est ce que le contrat en dit, et
 * c'est pour ça qu'il peut s'afficher des deux côtés sans porte à poser. Une
 * ligne sans trace n'a rien à dire, et rend une liste vide plutôt qu'une phrase
 * inventée.
 */
export function priceStepLabels(line: OrderLineView): readonly string[] {
  return (line.pricing?.steps ?? []).map((step) => step.label);
}

/**
 * Le prix a-t-il été **relevé** par une limite ?
 *
 * C'est le signe qu'une règle n'a pas produit son effet — et c'est exactement ce
 * qu'un client remarque avant nous.
 */
export function wasFloored(line: OrderLineView): boolean {
  return line.pricing?.floored ?? false;
}

/** Une ligne du récapitulatif de montants, dans le rail droit. */
export interface TotalRow {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  /** Second niveau sous le libellé — le taux d'une remise, par exemple. */
  readonly hint?: string;
  /** Le total TTC — mis en avant, et lui seul. */
  readonly strong: boolean;
}

/**
 * D'où vient la remise. Une seule source aujourd'hui — le point de retrait — et
 * son nom est déjà figé dans le snapshot d'adresse : on ne le redemande pas au
 * serveur, et il reste juste même si le point est renommé ou supprimé après coup.
 */
function discountLabel(order: OrderView): string {
  const point = order.fulfillmentMethod === 'pickup' ? order.pickupAddress : null;
  return point === null || point.label === '' ? 'Remise' : `Retrait — ${point.label}`;
}

/**
 * **Le récapitulatif des montants**, dans l'ordre où la formule du total les
 * additionne : sous-total, remise, livraison, surtaxe, TVA, total.
 *
 * L'ordre n'est pas une question de goût. Il se lit comme
 * `max(0, sous-total − remise) + livraison + surtaxe + TVA`, et une surtaxe
 * placée avant la remise ferait croire qu'elle a été remisée — ce qu'elle n'est
 * pas : on ne fait pas de geste commercial sur une pénalité de retard.
 *
 * Remise, livraison et surtaxe ne sont **rendues que si elles existent** : une
 * ligne « Remise 0,00 € » invite à chercher une remise qu'on n'a pas eue, et
 * une ligne « Surtaxe 0,00 € » ferait chercher un retard qui n'a pas eu lieu.
 *
 * Hors du composant, comme le reste de ce module : c'est de l'arithmétique de
 * lecture, et l'arithmétique se teste sans monter un gabarit.
 */
export function orderTotalRows(order: OrderView): readonly TotalRow[] {
  const rows: TotalRow[] = [
    {
      key: 'subtotal',
      label: 'Sous-total HT',
      value: formatCents(order.subtotalCents),
      strong: false,
    },
  ];
  if (order.discountCents > 0) {
    // La remise se NOMME : d'où elle vient, à quel taux, pour combien. « Remise
    // 70,68 € » toute seule oblige à ouvrir les réglages pour comprendre.
    const adjustment = order.discountAdjustment;
    rows.push({
      key: 'discount',
      label: discountLabel(order),
      ...(adjustment === null ? {} : { hint: formatAdjustment(adjustment) }),
      value: `− ${formatCents(order.discountCents)}`,
      strong: false,
    });
  }
  if (order.deliveryFeeCents > 0) {
    rows.push({
      key: 'delivery',
      label: 'Livraison HT',
      value: formatCents(order.deliveryFeeCents),
      strong: false,
    });
  }
  if (order.lateFeeCents > 0) {
    // Son taux de TVA est dit ici et nulle part ailleurs : les marchandises
    // portent le leur ligne à ligne, la surtaxe porte le sien, et c'est la
    // seule ligne dont on ne pourrait pas le retrouver — le réglage qui l'a
    // fixé aura changé.
    const frozen = order.lateFeeAdjustment;
    rows.push({
      key: 'late-fee',
      label: 'Surtaxe de retard HT',
      ...(frozen === null ? {} : { hint: formatLateFeeTerms(frozen) }),
      value: formatCents(order.lateFeeCents),
      strong: false,
    });
  }
  rows.push({ key: 'vat', label: 'TVA', value: formatCents(order.vatCents), strong: false });
  rows.push({
    key: 'total',
    label: 'Total TTC',
    value: formatCents(order.totalCents),
    strong: true,
  });
  return rows;
}
