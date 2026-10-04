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

// Recopié tel quel, jamais comparé à une horloge : le handler n'en lit aucune.
const HANDED_OVER_AT = new Date(60_000);
const REFERENCE = "CMD-0001";
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

  listByCompany = unused;
  listPersonal = unused;
  findById = unused;
  listForAdmin = unused;
  findForPacking = unused;
  listForProduction = unused;
}

/** `markFulfilled` conditionné comme en base : la première écriture gagne, les autres rendent `false`. */
class Repository extends OrderRepository {
  fulfilled = false;
  writes = 0;
  insideUnit: boolean[] = [];

  constructor(private readonly uow: TransactionalUnitOfWork) {
    super();
  }

  markFulfilled(): Promise<boolean> {
    this.insideUnit.push(this.uow.isOpen);
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

function subject(author: OrderAuthor | null = AUTHOR) {
  const uow = new TransactionalUnitOfWork();
  const repository = new Repository(uow);
  const handler = new MarkOrderFulfilledHandler(
    new Reader(author),
    repository,
    uow,
    new TransactionalDurablePublisher(uow),
  );
  return { handler, repository, uow };
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
    const { handler, uow } = subject(null);

    await expect(handler.execute(handOver())).rejects.toBeInstanceOf(OrderReferenceNotFoundError);
    expect(uow.committed).toEqual([]);
  });
});
