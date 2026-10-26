import type {
  DecidedDeparture,
  FrozenOrderAdjustments,
} from "../../../orders/domain/ports/shortfall-decision.reader.js";
import type { DeliveryNote, DeliveryNoteSource } from "../entities/delivery-note.js";
import { DecisionNoteNotFollowedError } from "../errors/delivery-note-errors.js";
import type { DeliveryNoteSourceLine } from "../value-objects/delivery-note-line.js";
import { departingSourceOf } from "./departing-source.js";

/**
 * **Les règles d'argent d'un reliquat** (plan E7 reliquat, choix 10) : la
 * fabrique E6c1 sur les lignes du reste seul — les pourcentages de remise
 * réappliqués ; une remise en montant fixe, le port et la surtaxe à zéro (ils
 * sont déjà comptés sur le BL-1). Le mode de TVA du port reste celui de la
 * commande, sans effet sur un port nul.
 */
export function remainderAdjustmentsOf(order: FrozenOrderAdjustments): FrozenOrderAdjustments {
  return {
    discount: order.discount?.mode === "percent" ? order.discount : null,
    deliveryFee: null,
    lateFee: null,
    deliveryVatMode: order.deliveryVatMode,
  };
}

/**
 * **Le reliquat tel que son BL le voit, une fois son départ décidé** (plan
 * E7 reliquat, lot LB) : SES lignes aux quantités décidées, ses montants
 * recomposés par {@link departingSourceOf} avec {@link remainderAdjustmentsOf}.
 * Le BL-1 n'y entre pas : chaque envoi a ses montants, le solde est leur somme
 * (choix 10).
 *
 * @throws {DecisionNoteNotFollowedError} le BL n'a pas d'en-tête, ou une ligne
 *   sans éligibilité connue — un reliquat né de `planRemainder` a les deux.
 * @throws {DecisionOutsideOrderError} un article décidé au-delà du reste.
 */
export function remainderDecisionSourceOf(
  orderNumber: string,
  note: DeliveryNote,
  decision: DecidedDeparture,
): DeliveryNoteSource {
  const state = note.toState();
  const terms = state.terms;
  if (terms === null) {
    throw new DecisionNoteNotFollowedError(state.number, "bon de livraison sans en-tête");
  }
  const lines = state.lines.map((line): DeliveryNoteSourceLine => {
    const eligible = line.pickupDiscountEligible;
    if (eligible === null) {
      throw new DecisionNoteNotFollowedError(
        state.number,
        `éligibilité inconnue sur « ${line.sku} »`,
      );
    }
    return { ...line, pickupDiscountEligible: eligible };
  });
  return departingSourceOf(
    { orderId: state.orderId, orderNumber, lines, terms },
    { departing: decision.departing, adjustments: remainderAdjustmentsOf(decision.adjustments) },
  );
}
