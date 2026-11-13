import type { DurableEvent, DurableFact } from "../../../../platform/outbox/durable-event.js";
import type { BillingWrite } from "../entities/order-billing.js";
import { OrderSettlementPayloadError } from "../errors/order-settlement-payload.error.js";

/** Nom STABLE du fait, clé de routage vers `@DurableHandler`. */
export const ORDER_BILLING_SETTLED = "order.billing_settled";

const WRITES: ReadonlySet<string> = new Set<BillingWrite>(["closed", "corrected"]);

/**
 * **Le solde d'une commande est écrit** — posé (`closed`) ou corrigé
 * (`corrected`) par `OrderBillingCloser`, dans la transaction qui l'écrit.
 * Ce qui attend le solde (la facture carte) l'écoute pour repartir seul.
 *
 * 🔴 **La clé est unique PAR ÉCRITURE** : `order.billing_settled:<writeId>`,
 * `writeId` tiré de l'`IdGenerator` à chaque écriture. Une clé dérivée du
 * contenu (`orderId:total:jour`) avalerait, par l'`ON CONFLICT DO NOTHING` de
 * la boîte d'envoi, une correction qui ne touche que la TVA, ou un
 * aller-retour A → B → A : le second fait n'existerait pas, et l'abonné ne
 * verrait jamais le solde qu'il attend. Deux écritures du solde sont deux
 * faits ; un rejeu de la même écriture est impossible (la transaction ne se
 * valide qu'une fois). Clé et payload sont définitifs dès le premier merge.
 */
export class OrderBillingSettledFact implements DurableEvent {
  constructor(
    readonly writeId: string,
    readonly orderId: string,
    readonly write: BillingWrite,
    readonly billableTotalCents: number,
    /** `AAAA-MM-JJ`. */
    readonly settledOn: string,
  ) {}

  durableFact(): DurableFact {
    return {
      type: ORDER_BILLING_SETTLED,
      key: `${ORDER_BILLING_SETTLED}:${this.writeId}`,
      payload: {
        orderId: this.orderId,
        write: this.write,
        billableTotalCents: this.billableTotalCents,
        settledOn: this.settledOn,
      },
    };
  }

  /**
   * L'abonné n'a besoin que de la commande ; le reste du payload se relit pour
   * le diagnostic. `writeId` n'est que dans la clé.
   *
   * @throws {OrderSettlementPayloadError} payload hors forme — faute d'émetteur.
   */
  static orderIdOf(payload: Readonly<Record<string, unknown>>): string {
    const { orderId, write } = payload;
    if (
      typeof orderId !== "string" ||
      orderId.length === 0 ||
      typeof write !== "string" ||
      !WRITES.has(write)
    ) {
      throw new OrderSettlementPayloadError(ORDER_BILLING_SETTLED);
    }
    return orderId;
  }
}
