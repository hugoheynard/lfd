import type { DeliveryNote } from "../entities/delivery-note.js";
import { termsDifferences } from "../value-objects/delivery-note-terms.js";
import type { FollowedOrder } from "./delivery-note-alignment.js";

/** Les statuts d'une commande dont le BL vivant est complet et doit la reprendre. */
const CONTROLLED_STATUSES: ReadonlySet<FollowedOrder["status"]> = new Set([
  "confirmed",
  "ready",
  "fulfilled",
]);

/** Un BL vivant dont l'en-tête ou les lignes ne reprennent pas sa commande. */
export interface DeliveryNoteTermsGap {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly noteNumber: string;
  /** Les champs en écart ; `terms` seul si l'en-tête est vide. */
  readonly fields: readonly string[];
}

/**
 * **Le contrôle qu'E4b exigera** (plan
 * plan E4a (`documentation/commandes/bon-de-livraison.md`), § 2 et § 4) : pour
 * chaque BL vivant d'une commande complète, ses totaux d'en-tête et
 * l'éligibilité de ses lignes sont-ils ceux de la commande, champ par champ ?
 * Tant que chaque BL est complet (avant E6), l'égalité est la règle.
 *
 * Rend un écart par BL fautif ; vide si tout concorde, ou si la commande
 * n'est pas contrôlée (`placed`, annulée, sans ligne).
 */
export function termsGapsOf(
  order: FollowedOrder,
  notes: readonly DeliveryNote[],
): readonly DeliveryNoteTermsGap[] {
  if (!CONTROLLED_STATUSES.has(order.status) || order.lines.length === 0) {
    return [];
  }
  return (
    notes
      // Un reliquat porte SES lignes et SES montants (plan E7, choix 10) : seul le
      // BL-1 doit reprendre la commande.
      .filter((note) => note.orderId === order.orderId && note.isLive && note.followsItsOrder)
      .flatMap((note) => {
        const fields = gapFields(order, note);
        return fields.length === 0
          ? []
          : [
              {
                orderId: order.orderId,
                orderNumber: order.orderNumber,
                noteNumber: note.number,
                fields,
              },
            ];
      })
  );
}

function gapFields(order: FollowedOrder, note: DeliveryNote): readonly string[] {
  const { terms, lines } = note.toState();
  if (terms === null) {
    return ["terms"];
  }
  const sameLineCount = lines.length === order.lines.length;
  const eligibilityDiffers = lines.some(
    (line, index) => line.pickupDiscountEligible !== order.lines[index]?.pickupDiscountEligible,
  );
  return [
    ...termsDifferences(terms, order.terms),
    ...(sameLineCount ? [] : ["lines"]),
    ...(eligibilityDiffers ? ["pickupDiscountEligible"] : []),
  ];
}
