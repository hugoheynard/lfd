import {
  OrderPayerReader,
  type OrderPayerStanding,
} from "../../../domain/ports/order-payer.reader.js";

/**
 * Le lecteur du payeur, doublé à la main : chaque société paie pour elle-même,
 * sauf celles qu'on lui décrit. Hérite du port abstrait — un doublé qui
 * dériverait du port ne compilerait plus.
 */
export class FixedOrderPayers extends OrderPayerReader {
  readonly asked: { companyId: string; at: Date }[] = [];

  constructor(private readonly standings: ReadonlyMap<string, OrderPayerStanding> = new Map()) {
    super();
  }

  standingAt(companyId: string, at: Date): Promise<OrderPayerStanding | null> {
    this.asked.push({ companyId, at });
    return Promise.resolve(
      this.standings.get(companyId) ?? {
        companyId,
        companyName: companyId,
        groupWithoutDelivery: false,
        billingFollow: null,
      },
    );
  }
}

/** Chaque société paie pour elle-même — le cas de toutes les suites d'avant S4. */
export function ownPayers(): FixedOrderPayers {
  return new FixedOrderPayers();
}
