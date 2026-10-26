import type { OrderStatus } from "@lfd/contracts";

import {
  TransactionalDurablePublisher,
  TransactionalUnitOfWork,
} from "../../../../../platform/outbox/__tests__/transactional-durable.js";
import {
  ORDER_FULFILLED,
  OrderHandedOverEvent,
} from "../../../domain/events/order-handed-over.event.js";
import { PendingRemaindersReader } from "../../../domain/ports/pending-remainders.reader.js";
import { SettledOrderWriter } from "../../../domain/ports/settled-order.writer.js";
import { readerOf, view } from "../../handlers/__tests__/order-placed-mail-doubles.js";
import { OrderRemainderSettler } from "../order-remainder-settler.js";

// Plan E7 reliquat, lot L5b : le dernier reste remis solde la commande.

// Recopié tel quel, jamais comparé à une horloge.
const HANDED_AT = new Date(120_000);

class Remainders extends PendingRemaindersReader {
  constructor(private readonly pending: boolean) {
    super();
  }

  anyPending(): Promise<boolean> {
    return Promise.resolve(this.pending);
  }
}

/** Conditionné comme en base : seule une commande en partie retirée passe, une fois. */
class Writer extends SettledOrderWriter {
  readonly settled: string[] = [];

  constructor(private status: OrderStatus) {
    super();
  }

  settle(orderId: string): Promise<boolean> {
    if (this.status !== "partially_handed_over") {
      return Promise.resolve(false);
    }
    this.status = "fulfilled";
    this.settled.push(orderId);
    return Promise.resolve(true);
  }
}

function subject(status: OrderStatus, pending = false, known = true) {
  const uow = new TransactionalUnitOfWork();
  const order = view({ id: "ord_1", orderNumber: "ORD-0001", status });
  const writer = new Writer(status);
  const settler = new OrderRemainderSettler(
    readerOf(known ? order : null),
    new Remainders(pending),
    writer,
    new TransactionalDurablePublisher(uow),
  );
  return { settler, writer, uow };
}

const act = {
  orderId: "ord_1",
  handedOverBy: "staff_b",
  handedOverAt: HANDED_AT,
  via: "manual",
} as const;

describe("OrderRemainderSettler — le solde au dernier reste", () => {
  it("le dernier reste d'une commande en partie retirée : `fulfilled` et `order.fulfilled`", async () => {
    const { settler, writer, uow } = subject("partially_handed_over");

    await uow.run(async () => {
      expect(await settler.settleIfComplete(act)).toBe(true);
    });

    expect(writer.settled).toEqual(["ord_1"]);
    expect(uow.of(ORDER_FULFILLED)).toEqual([
      new OrderHandedOverEvent(
        "ord_1",
        "ORD-0001",
        "user_7",
        "staff_b",
        HANDED_AT,
        "manual",
      ).durableFact(),
    ]);
  });

  it("un autre reste attend : rien n'est soldé", async () => {
    const { settler, writer, uow } = subject("partially_handed_over", true);

    await uow.run(async () => {
      expect(await settler.settleIfComplete(act)).toBe(false);
    });

    expect(writer.settled).toEqual([]);
    expect(uow.of(ORDER_FULFILLED)).toEqual([]);
  });

  it("le rang 1 pas encore retiré : c'est sa remise qui soldera", async () => {
    const { settler, uow } = subject("ready");

    await uow.run(async () => {
      expect(await settler.settleIfComplete(act)).toBe(false);
    });

    expect(uow.of(ORDER_FULFILLED)).toEqual([]);
  });

  it("un rejeu sur une commande déjà soldée ne republie rien", async () => {
    const { settler, uow } = subject("fulfilled");

    await uow.run(async () => {
      expect(await settler.settleIfComplete(act)).toBe(false);
    });

    expect(uow.committed).toEqual([]);
  });

  it("une commande inconnue : rien", async () => {
    const { settler } = subject("partially_handed_over", false, false);

    expect(await settler.settleIfComplete(act)).toBe(false);
  });
});
