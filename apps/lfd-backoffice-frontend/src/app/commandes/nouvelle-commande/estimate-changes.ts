import type { AdminOrderEstimateAmountsView } from '@lfd/contracts';
import { formatCents } from '@lfd/b2b-ui/order';

/**
 * **« Le total TTC est passé de X à Y : … »** — ce qui a bougé entre deux
 * estimations de la saisie (plan
 * `documentation/pricing/centime-et-tva/plan-total-vu.md`, § 6, T3).
 *
 * La passation a refusé le total que l'estimation montrait (409
 * `orders.total_changed`) ; la page en a redemandé une. Ce module COMPARE les
 * deux réponses du serveur, terme à terme — surtaxe, port, remises, lignes,
 * TVA — et n'en calcule aucune : pas une somme, pas une différence.
 *
 * `null` quand le total n'a pas bougé : un écart nul ne produit aucun message.
 */
export function estimateChangeMessage(
  before: AdminOrderEstimateAmountsView,
  after: AdminOrderEstimateAmountsView,
): string | null {
  if (before.totalCents === after.totalCents) {
    return null;
  }
  const changes = estimateChangesOf(before, after);
  const list = new Intl.ListFormat('fr', { type: 'conjunction' }).format(
    changes.length === 0 ? ['les prix ont été mis à jour'] : changes,
  );
  return `Le total TTC est passé de ${formatCents(before.totalCents)} à ${formatCents(after.totalCents)} : ${list}.`;
}

/** Les termes qui diffèrent, dans l'ordre où l'on comprend un écart. */
export function estimateChangesOf(
  before: AdminOrderEstimateAmountsView,
  after: AdminOrderEstimateAmountsView,
): readonly string[] {
  return [
    ...lateFeeChanges(before.lateFeeCents, after.lateFeeCents),
    ...(before.deliveryFeeCents === after.deliveryFeeCents
      ? []
      : [
          `frais de livraison : ${formatCents(before.deliveryFeeCents)} → ${formatCents(after.deliveryFeeCents)} HT`,
        ]),
    ...discountChanges(before, after),
    ...lineChanges(before, after),
    ...(before.vatCents === after.vatCents
      ? []
      : [`TVA : ${formatCents(before.vatCents)} → ${formatCents(after.vatCents)}`]),
  ];
}

/** La surtaxe : apparue, elle se dit avec la raison ; changée, ses deux montants. */
function lateFeeChanges(was: number, is: number): readonly string[] {
  if (was === is) {
    return [];
  }
  return was === 0
    ? [`la commande arrive après l’heure limite, un supplément de ${formatCents(is)} HT s’applique`]
    : [`supplément de retard : ${formatCents(was)} → ${formatCents(is)} HT`];
}

/** Une remise nommée qui a disparu, puis le montant des remises s'il a bougé. */
function discountChanges(
  before: AdminOrderEstimateAmountsView,
  after: AdminOrderEstimateAmountsView,
): readonly string[] {
  const kept = new Set(after.discounts.map((discount) => discount.label));
  const ended = before.discounts
    .map((discount) => discount.label)
    .filter((label): label is string => label !== null && !kept.has(label))
    .map((label) => `la remise « ${label} » a pris fin`);
  const amount =
    before.discountCents === after.discountCents
      ? []
      : [`remises : ${formatCents(before.discountCents)} → ${formatCents(after.discountCents)} HT`];
  return [...ended, ...amount];
}

/** Les lignes retirées, puis celles dont le prix a changé à quantité égale. */
function lineChanges(
  before: AdminOrderEstimateAmountsView,
  after: AdminOrderEstimateAmountsView,
): readonly string[] {
  const next = new Map(after.lines.map((line) => [line.sku, line]));
  return before.lines.flatMap((line) => {
    const is = next.get(line.sku);
    if (is === undefined) {
      return [`${line.productName} n’est plus dans la commande`];
    }
    if (is.quantity !== line.quantity || is.lineTotalCents === line.lineTotalCents) {
      return [];
    }
    return [
      `${line.productName} : ${formatCents(line.lineTotalCents)} → ${formatCents(is.lineTotalCents)} HT`,
    ];
  });
}
