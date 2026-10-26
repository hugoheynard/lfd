import {
  BinsNotDeclarableError,
  OrderBinsCarriedByTransferError,
} from "../../domain/errors/delivery-loading-errors.js";
import { deliveryOn, FixedDeliveryOrders } from "../commands/__tests__/round-doubles.js";
import { declarableReference } from "../delivery-loading-support.js";
import { FixedTransferredOrders } from "./transfer-doubles.js";
import type { DeliveryOrderFacts } from "../../channels/commerce/delivery-orders.reader.js";

// Des jours comparés entre eux seulement, jamais à l'horloge.
const DAY = "2030-03-12";

const ORDERS = new FixedDeliveryOrders([
  deliveryOn("o_village", DAY, { delivery: false }),
  deliveryOn("o_counter", DAY, { delivery: false }),
  deliveryOn("o_cancelled", DAY, { delivery: false, status: "cancelled" }),
]);

/**
 * Q-T4 révisée par Hugo le 2026-10-13 (lot T3) : le lot T1 donnait un bac à
 * chaque retrait porté par un transfert ; il se met désormais en SACS, et
 * les sacs vont dans les bacs du TRANSFERT, déclarés au chargement.
 */
describe("un retrait porté par un transfert ne reçoit plus de bac à lui (lot T3, Q-T4 révisée)", () => {
  const carried = new FixedTransferredOrders(["o_village", "o_cancelled"]);

  it("refuse le retrait d'un site servi par transfert, en nommant les bacs du transfert", async () => {
    await expect(declarableReference(ORDERS, carried, "o_village")).rejects.toThrow(
      OrderBinsCarriedByTransferError,
    );
    await expect(declarableReference(ORDERS, carried, "o_village")).rejects.toThrow(
      "ses sacs vont dans les bacs du transfert",
    );
  });

  it("refuse toujours un retrait au comptoir, et une commande annulée", async () => {
    await expect(declarableReference(ORDERS, carried, "o_counter")).rejects.toThrow(
      BinsNotDeclarableError,
    );
    await expect(declarableReference(ORDERS, carried, "o_cancelled")).rejects.toThrow(
      BinsNotDeclarableError,
    );
  });
});

/** Le nombre de lectures en vol, partagé par les deux doubles ci-dessous. */
class InFlight {
  current = 0;
  peak = 0;

  async around<T>(read: () => Promise<T>): Promise<T> {
    this.current += 1;
    this.peak = Math.max(this.peak, this.current);
    // Un tour de boucle : une seconde lecture lancée en parallèle entrerait ici.
    await Promise.resolve();
    try {
      return await read();
    } finally {
      this.current -= 1;
    }
  }
}

class CountedOrders extends FixedDeliveryOrders {
  constructor(private readonly inFlight: InFlight) {
    super([deliveryOn("o_delivered", DAY)]);
  }

  override byIds(orderIds: readonly string[]): Promise<readonly DeliveryOrderFacts[]> {
    return this.inFlight.around(() => super.byIds(orderIds));
  }
}

class CountedTransferred extends FixedTransferredOrders {
  constructor(private readonly inFlight: InFlight) {
    super();
  }

  override transferredAmong(orderIds: readonly string[]): Promise<ReadonlySet<string>> {
    return this.inFlight.around(() => super.transferredAmong(orderIds));
  }
}

/**
 * Régression : les deux lectures partaient en `Promise.all` sous l'unité de
 * travail du bac, donc sur le MÊME client de transaction — `pg` les file en
 * avertissant (DeprecationWarning à chaque boot des e2e du semis, 2026-10-26).
 */
it("lit la commande puis le transfert, jamais les deux à la fois", async () => {
  const inFlight = new InFlight();

  await declarableReference(
    new CountedOrders(inFlight),
    new CountedTransferred(inFlight),
    "o_delivered",
  );

  expect(inFlight.peak).toBe(1);
});
