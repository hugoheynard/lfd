import type { CustomerOrderLineView, CustomerOrderView } from '@lfd/contracts';

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
export function entryPriceOf(line: CustomerOrderLineView): number | null {
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
export function priceStepLabels(line: CustomerOrderLineView): readonly string[] {
  return (line.pricing?.steps ?? []).map((step) => step.label);
}

/**
 * Le prix a-t-il été **relevé** par une limite ?
 *
 * C'est le signe qu'une règle n'a pas produit son effet — et c'est exactement ce
 * qu'un client remarque avant nous.
 */
export function wasFloored(line: CustomerOrderLineView): boolean {
  return line.pricing?.floored ?? false;
}

/** Une ligne du récapitulatif de montants, dans le rail droit. */
export interface TotalRow {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  /** Second niveau sous le libellé — le taux d'une remise, par exemple. */
  readonly hint?: string;
  /** Le total — TTC, ou HT pour un pro au compte (F5) — mis en avant, et lui seul. */
  readonly strong: boolean;
}

/**
 * D'où vient la remise. Une seule source aujourd'hui — le point de retrait — et
 * son nom est déjà figé dans le snapshot d'adresse : on ne le redemande pas au
 * serveur, et il reste juste même si le point est renommé ou supprimé après coup.
 */
function discountLabel(order: CustomerOrderView): string {
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
export function orderTotalRows(order: CustomerOrderView): readonly TotalRow[] {
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
  if (order.voucherDiscountCents > 0) {
    // Le bon de fidélité, APRÈS la remise et sur sa propre ligne : la facture
    // et l'assiette des points les distinguent (plan des points, C7).
    rows.push({
      key: 'voucher',
      label: 'Bon de fidélité',
      value: `− ${formatCents(order.voucherDiscountCents)}`,
      strong: false,
    });
  }
  if (order.deliveryFeeCents > 0) {
    rows.push({
      key: 'delivery',
      label: 'Livraison HT',
      value: formatCents(order.deliveryFeeCents),
      strong: false,
      ...deliveryVatHint(order),
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
  return [...rows, ...(order.settlement === 'account' ? pretaxTail(order) : taxedTail(order))];
}

/**
 * Le taux de la livraison, dit sous son montant. Le mode est figé à la
 * passation ; `null` = commande d'avant le réglage, taxée au taux normal
 * (plan-tva-des-frais-de-port.md, V5).
 *
 * Au compte et au prorata, AUCUN taux : il n'y en a pas un seul, et le bon ne
 * chiffre pas la TVA (F5) — la livraison s'y lit en HT, sans plus.
 */
function deliveryVatHint(order: CustomerOrderView): { readonly hint?: string } {
  if (order.deliveryVatMode === 'follows_goods') {
    return order.settlement === 'account' ? {} : { hint: 'TVA au prorata des produits' };
  }
  return { hint: 'TVA 20 %' };
}

/** La mention d'un bon au compte, sous son total HT (F5). */
const PRETAX_ONLY_NOTE = 'TVA et TTC sur la facture du mois';

/**
 * **Le pied d'un pro au compte : le HT seul** (plan
 * `bons-et-facture-concordants`, F5). La TVA se calcule une fois sur la
 * facture du mois ; un TTC par bon la contredirait de quelques centimes, et un
 * écart ressemble à une erreur. Le HT est le total moins la TVA figés — rien
 * n'est recalculé, et aucun chiffre de TVA ni de TTC n'est rendu.
 */
function pretaxTail(order: CustomerOrderView): readonly TotalRow[] {
  return [
    {
      key: 'total',
      label: 'Total HT',
      hint: PRETAX_ONLY_NOTE,
      value: formatCents(order.totalCents - order.vatCents),
      strong: true,
    },
  ];
}

/** Le pied d'une commande réglée à la commande (carte, gratuite) : inchangé. */
function taxedTail(order: CustomerOrderView): readonly TotalRow[] {
  return [
    { key: 'vat', label: 'TVA', value: formatCents(order.vatCents), strong: false },
    { key: 'total', label: 'Total TTC', value: formatCents(order.totalCents), strong: true },
  ];
}
