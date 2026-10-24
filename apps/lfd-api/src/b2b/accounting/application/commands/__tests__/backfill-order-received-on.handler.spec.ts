import { OrderDeliveryDays } from "../../../domain/ports/order-delivery-days.js";
import { BackfillOrderReceivedOnCommand } from "../backfill-order-received-on.command.js";
import { BackfillOrderReceivedOnHandler } from "../backfill-order-received-on.handler.js";
import { EveryOrderHandedOver, NoHandovers, NoStops } from "./monthly-invoice-doubles.js";

/**
 * La reprise des dates de réception (plan `plan-date-de-reception.md`, §8) —
 * ports doublés à la main. Les instants sont le SUJET : ils ne sont comparés
 * qu'au jour qu'ils donnent, aucune horloge n'est lue.
 */

/** La colonne `received_on` et son `where received_on IS NULL`. */
class MemoryDeliveryDays extends OrderDeliveryDays {
  readonly days = new Map<string, string>();
  recordFirst(orderId: string, day: string): Promise<boolean> {
    if (this.days.has(orderId)) {
      return Promise.resolve(false);
    }
    this.days.set(orderId, day);
    return Promise.resolve(true);
  }
}

/** Remise à 00h30 le 1er novembre à Paris — le 31 octobre en UTC. */
const HANDED_OVER_AT = new Date("2026-10-31T23:30:00.000Z");

describe("BackfillOrderReceivedOn — la reprise date toute commande remise", () => {
  /**
   * Régression (2026-10-24) : `RecordOrderDeliveryDayCommand` ne pose rien sans
   * ligne `order_handover` ; une commande remise sans attestation restait sans
   * date, et la contrainte de B4 aurait échoué.
   */
  it("une commande remise sans attestation de retrait restait sans date de réception", async () => {
    const days = new MemoryDeliveryDays();

    await new BackfillOrderReceivedOnHandler(new NoHandovers(), new NoStops(), days).execute(
      new BackfillOrderReceivedOnCommand("o1", HANDED_OVER_AT),
    );

    expect(days.days.get("o1")).toBe("2026-11-01");
  });

  it("avec attestation : la règle de la facture prime sur le repli", async () => {
    const days = new MemoryDeliveryDays();
    const attestedAt = new Date("2026-10-29T09:00:00.000Z");

    await new BackfillOrderReceivedOnHandler(
      new EveryOrderHandedOver(attestedAt),
      new NoStops(),
      days,
    ).execute(new BackfillOrderReceivedOnCommand("o1", HANDED_OVER_AT));

    expect(days.days.get("o1")).toBe("2026-10-29");
  });

  it("une date déjà posée ne bouge pas", async () => {
    const days = new MemoryDeliveryDays();
    days.days.set("o1", "2026-10-02");

    await new BackfillOrderReceivedOnHandler(new NoHandovers(), new NoStops(), days).execute(
      new BackfillOrderReceivedOnCommand("o1", HANDED_OVER_AT),
    );

    expect(days.days.get("o1")).toBe("2026-10-02");
  });
});
