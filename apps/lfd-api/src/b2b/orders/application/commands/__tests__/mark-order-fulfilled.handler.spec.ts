import {
  OrderDeliveryHistoryReader,
  type OrderDeliveryStopFact,
} from "../../../../../delivery/channels/commerce/index.js";
import {
  OrderHandoverHistoryReader,
  type OrderHandoverHistoryFact,
} from "../../../../../handover/channels/commerce/index.js";
import {
  TransactionalDurablePublisher,
  TransactionalUnitOfWork,
} from "../../../../../platform/outbox/__tests__/transactional-durable.js";
import { OrderReferenceNotFoundError } from "../../../domain/errors/order-errors.js";
import {
  ORDER_FULFILLED,
  OrderHandedOverEvent,
} from "../../../domain/events/order-handed-over.event.js";
import { OrderReader, type OrderAuthor } from "../../../domain/ports/order.reader.js";
import { OrderRepository } from "../../../domain/ports/order.repository.js";
import { MarkOrderFulfilledCommand } from "../mark-order-fulfilled.command.js";
import { MarkOrderFulfilledHandler } from "../mark-order-fulfilled.handler.js";
import { RecordingDeliveryNoteFollowing } from "./delivery-note-following-double.js";

// Recopié tel quel, jamais comparé à une horloge : le handler n'en lit aucune.
const HANDED_OVER_AT = new Date(60_000);
/** Le jour de Paris de `HANDED_OVER_AT` (1er janvier 1970, 01h01 à Paris). */
const HANDED_OVER_DAY = "1970-01-01";
/** Le 3 octobre 2026 à 00h30 à Paris — une attestation passée minuit. */
const AFTER_MIDNIGHT = new Date("2026-10-02T22:30:00.000Z");
const REFERENCE = "ORD-0001";
const AUTHOR: OrderAuthor = { orderId: "ord_1", orderNumber: REFERENCE, placedByUserId: "user_1" };

function unused(): Promise<never> {
  return Promise.reject(new RangeError("non utilisé"));
}

class Reader extends OrderReader {
  constructor(private readonly author: OrderAuthor | null) {
    super();
  }

  findAuthorByReference(): Promise<OrderAuthor | null> {
    return Promise.resolve(this.author);
  }

  listPersonal = unused;
  findById = unused;
  findForPacking = unused;
  listForProduction = unused;
}

/** `markFulfilled` conditionné comme en base : la première écriture gagne, les autres rendent `false`. */
class Repository extends OrderRepository {
  fulfilled = false;
  writes = 0;
  insideUnit: boolean[] = [];
  receivedOn: string[] = [];

  constructor(private readonly uow: TransactionalUnitOfWork) {
    super();
  }

  markFulfilled(
    _reference: string,
    _at: Date,
    _by: string,
    _via: string,
    receivedOn: string,
  ): Promise<boolean> {
    this.insideUnit.push(this.uow.isOpen);
    this.receivedOn.push(receivedOn);
    if (this.fulfilled) {
      return Promise.resolve(false);
    }
    this.fulfilled = true;
    this.writes += 1;
    return Promise.resolve(true);
  }

  place = unused;
  markPaid = unused;
  markPaymentFailed = unused;
  markAbandoned = unused;
  failAtClosing = unused;
  markReady = unused;
  absorbIntoPlan = unused;
}

/** Ce que le retrait a attesté, commande par commande. */
class Handovers extends OrderHandoverHistoryReader {
  constructor(private readonly facts: readonly OrderHandoverHistoryFact[]) {
    super();
  }

  ofOrders(): Promise<ReadonlyMap<string, OrderHandoverHistoryFact>> {
    return Promise.resolve(new Map(this.facts.map((fact) => [fact.orderId, fact])));
  }
}

/** Les arrêts que la livraison garde. */
class Stops extends OrderDeliveryHistoryReader {
  constructor(private readonly stops: readonly OrderDeliveryStopFact[]) {
    super();
  }

  ofOrders(): Promise<readonly OrderDeliveryStopFact[]> {
    return Promise.resolve(this.stops);
  }
}

interface World {
  readonly author?: OrderAuthor | null;
  readonly handovers?: readonly OrderHandoverHistoryFact[];
  readonly stops?: readonly OrderDeliveryStopFact[];
}

function subject(world: World = {}) {
  const uow = new TransactionalUnitOfWork();
  const repository = new Repository(uow);
  const notes = new RecordingDeliveryNoteFollowing(() => uow.isOpen);
  const handler = new MarkOrderFulfilledHandler(
    new Reader(world.author === undefined ? AUTHOR : world.author),
    repository,
    uow,
    new TransactionalDurablePublisher(uow),
    new Handovers(world.handovers ?? []),
    new Stops(world.stops ?? []),
    notes,
  );
  return { handler, repository, uow, notes };
}

/** Un arrêt parti et clos sans retour, le jour donné. */
function closedStop(serviceDay: string): OrderDeliveryStopFact {
  return {
    orderId: "ord_1",
    serviceDay,
    placedAt: new Date(0),
    departedAt: new Date(1),
    closedAt: new Date(2),
    broughtBackAt: null,
  };
}

const handOver = () => new MarkOrderFulfilledCommand(REFERENCE, "staff_a", HANDED_OVER_AT, "scan");

describe("le commerce clôt une commande retirée", () => {
  it("écrit `fulfilled` et `order.fulfilled` dans la MÊME unité de travail", async () => {
    const { handler, repository, uow } = subject();

    await handler.execute(handOver());

    expect(repository.insideUnit).toEqual([true]);
    expect(uow.of(ORDER_FULFILLED)).toEqual([
      new OrderHandedOverEvent(
        "ord_1",
        REFERENCE,
        "user_1",
        "staff_a",
        HANDED_OVER_AT,
        "scan",
      ).durableFact(),
    ]);
    expect(uow.of(ORDER_FULFILLED)[0]?.key).toBe("order.fulfilled:ord_1");
  });

  it("🔴 une commande DÉJÀ retirée est un succès sans effet — ni écriture, ni second fait", async () => {
    // Le fait du retrait est livré au moins une fois, et réannoncé à chaque
    // rescan refusé : un second `order.fulfilled` créditerait deux fois.
    const { handler, repository, uow } = subject();

    await handler.execute(handOver());
    await handler.execute(handOver());

    expect(repository.writes).toBe(1);
    expect(uow.committed).toHaveLength(1);
  });

  it("une référence inconnue lève — incohérence entre deux contextes, message mort visible", async () => {
    const { handler, uow } = subject({ author: null });

    await expect(handler.execute(handOver())).rejects.toBeInstanceOf(OrderReferenceNotFoundError);
    expect(uow.committed).toEqual([]);
  });
});

describe("la date de réception part avec la remise (date-de-reception, B2)", () => {
  it("au comptoir : le jour de Paris de la remise attestée", async () => {
    const { handler, repository } = subject({
      handovers: [{ orderId: "ord_1", handedOverAt: AFTER_MIDNIGHT, via: "scan", atDoor: false }],
    });

    await handler.execute(handOver());

    expect(repository.receivedOn).toEqual(["2026-10-03"]);
  });

  it("à la porte : le jour de la tournée, même attestée après minuit", async () => {
    const { handler, repository } = subject({
      handovers: [{ orderId: "ord_1", handedOverAt: AFTER_MIDNIGHT, via: "scan", atDoor: true }],
      stops: [closedStop("2026-10-02")],
    });

    await handler.execute(handOver());

    expect(repository.receivedOn).toEqual(["2026-10-02"]);
  });

  it("les arrêts d'une autre commande ne datent pas celle-ci", async () => {
    const { handler, repository } = subject({
      handovers: [{ orderId: "ord_1", handedOverAt: AFTER_MIDNIGHT, via: "scan", atDoor: true }],
      stops: [{ ...closedStop("2026-09-01"), orderId: "ord_other" }],
    });

    await handler.execute(handOver());

    expect(repository.receivedOn).toEqual(["2026-10-03"]);
  });

  /**
   * Régression (2026-10-24) : une commande remise restait sans date de
   * réception quand l'abonné ne passait pas — deux abonnés écrivaient les deux
   * colonnes chacun dans sa transaction. Et sans attestation lisible, la
   * règle rendait `null`.
   */
  it("une commande remise restait sans date de réception quand l'abonné ne passait pas", async () => {
    const { handler, repository } = subject();

    await handler.execute(handOver());

    expect(repository.receivedOn).toEqual([HANDED_OVER_DAY]);
  });
});

describe("le BL suit la remise (plan E2, § 8.3)", () => {
  it("le gagnant fait passer le BL `handed_over`, DANS l'unité de travail de la remise", async () => {
    const { handler, notes } = subject();

    await handler.execute(
      new MarkOrderFulfilledCommand(REFERENCE, "staff_a", HANDED_OVER_AT, "scan"),
    );

    expect(notes.calls).toEqual(["hand-over:ord_1"]);
    expect(notes.insideUnit).toEqual([true]);
  });

  it("une réannonce perdue ne touche pas au BL", async () => {
    const { handler, notes } = subject();
    const command = new MarkOrderFulfilledCommand(REFERENCE, "staff_a", HANDED_OVER_AT, "scan");
    await handler.execute(command);

    await handler.execute(command);

    expect(notes.calls).toEqual(["hand-over:ord_1"]);
  });
});
