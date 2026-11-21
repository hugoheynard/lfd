import { randomUUID } from "node:crypto";

import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { inMemoryIntents } from "../../../../../platform/intent/__tests__/in-memory-gesture-intent.ledger.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  OrderReviews,
  type OrderReviewRecord,
  type ReviewedOrder,
} from "../../../domain/entities/order-reviews.js";
import { OrderNotFoundError } from "../../../domain/errors/order-errors.js";
import {
  OrderNotReviewedError,
  OrderReviewOutOfScopeError,
} from "../../../domain/errors/order-review-errors.js";
import { ORDER_REVIEW_WITHDRAWN } from "../../../domain/events/order-review-withdrawn.fact.js";
import { ORDER_REVIEWED } from "../../../domain/events/order-reviewed.fact.js";
import { OrderReviewsRepository } from "../../../domain/ports/order-reviews.repository.js";
import { ORDER_REVIEW_STARTS_AT } from "../../../domain/services/order-review-start.js";
import { ReviewOrderCommand } from "../review-order.command.js";
import { ReviewOrderHandler } from "../review-order.handler.js";
import { WithdrawOrderReviewCommand } from "../withdraw-order-review.command.js";
import { WithdrawOrderReviewHandler } from "../withdraw-order-review.handler.js";
import { RecordingDurable } from "./durable-doubles.js";

/** L'instant du geste, tiré de la mise en service : il n'est comparé qu'à elle. */
const NOW = new Date(ORDER_REVIEW_STARTS_AT.getTime() + 2 * 86_400_000);

const PRO_ORDER: ReviewedOrder = {
  orderId: "ord_1",
  orderNumber: "LFC-0001",
  placedByUserId: "user_1",
  companyId: "cmp_1",
  placedByStaffId: null,
  clientele: "pro",
  status: "placed",
  placedAt: ORDER_REVIEW_STARTS_AT,
  revision: 2,
};

/** Le registre d'une commande en mémoire : chaque chargement relit ce qui a été écrit. */
class MemoryReviews extends OrderReviewsRepository {
  records: OrderReviewRecord[] = [];
  saves = 0;

  constructor(private readonly order: ReviewedOrder | null = PRO_ORDER) {
    super();
  }

  load(orderId: string): Promise<OrderReviews | null> {
    if (this.order === null || this.order.orderId !== orderId) {
      return Promise.resolve(null);
    }
    return Promise.resolve(OrderReviews.of(this.order, this.records));
  }

  save(reviews: OrderReviews): Promise<void> {
    this.saves += 1;
    const { created, withdrawn } = reviews.changes();
    if (withdrawn !== null) {
      this.records = this.records.map((record) =>
        record.id === withdrawn.id ? withdrawn : record,
      );
    }
    if (created !== null) {
      this.records = [...this.records, created];
    }
    return Promise.resolve();
  }
}

function setup(order: ReviewedOrder | null = PRO_ORDER) {
  const repo = new MemoryReviews(order);
  const durable = new RecordingDurable();
  const intents = inMemoryIntents();
  const clock = new FixedClock(NOW);
  return {
    repo,
    durable,
    review: new ReviewOrderHandler(
      repo,
      durable,
      new FixedIdGenerator("rev"),
      clock,
      new DirectUnitOfWork(),
      intents,
    ),
    withdraw: new WithdrawOrderReviewHandler(repo, durable, clock, new DirectUnitOfWork(), intents),
  };
}

describe("ReviewOrderHandler", () => {
  it("vise, écrit le registre et publie `order.reviewed` avec l'auteur et la révision", async () => {
    const { repo, durable, review } = setup();

    await review.execute(new ReviewOrderCommand("ord_1", "stf_1", "RAS", randomUUID()));

    expect(repo.records).toEqual([
      {
        id: "rev_000001",
        reviewedRevision: 2,
        reviewedByStaffId: "stf_1",
        reviewedAt: NOW,
        note: "RAS",
        withdrawn: null,
      },
    ]);
    expect(durable.facts).toEqual([
      {
        type: ORDER_REVIEWED,
        key: `${ORDER_REVIEWED}:rev_000001`,
        payload: {
          reviewId: "rev_000001",
          orderId: "ord_1",
          orderNumber: "LFC-0001",
          placedByUserId: "user_1",
          reviewedRevision: 2,
          reviewedByStaffId: "stf_1",
          reviewedAt: NOW.toISOString(),
        },
      },
    ]);
  });

  /** Régression attendue : un double clic sur « Vérifier » ne doit ni doubler ni refuser. */
  it("rejoué sous la même clé, ne vise pas deux fois et ne refuse pas « déjà visée »", async () => {
    const { repo, durable, review } = setup();
    const key = randomUUID();

    await review.execute(new ReviewOrderCommand("ord_1", "stf_1", null, key));
    await review.execute(new ReviewOrderCommand("ord_1", "stf_1", null, key));

    expect(repo.records).toHaveLength(1);
    expect(durable.facts).toHaveLength(1);
  });

  it("refuse une commande inconnue", async () => {
    const { review } = setup(null);

    await expect(
      review.execute(new ReviewOrderCommand("ord_1", "stf_1", null, randomUUID())),
    ).rejects.toBeInstanceOf(OrderNotFoundError);
  });

  it("refuse hors périmètre sans rien écrire ni publier", async () => {
    const { repo, durable, review } = setup({ ...PRO_ORDER, placedByStaffId: "stf_9" });

    await expect(
      review.execute(new ReviewOrderCommand("ord_1", "stf_1", null, randomUUID())),
    ).rejects.toBeInstanceOf(OrderReviewOutOfScopeError);
    expect(repo.saves).toBe(0);
    expect(durable.facts).toEqual([]);
  });
});

describe("ReviewOrderHandler — commande révisée depuis son visa", () => {
  it("remplace le visa en un geste, et publie le retrait de l'ancien puis le nouveau visa", async () => {
    const { repo, durable, review } = setup();
    repo.records = [
      {
        id: "rev_old",
        reviewedRevision: 1,
        reviewedByStaffId: "stf_1",
        reviewedAt: ORDER_REVIEW_STARTS_AT,
        note: null,
        withdrawn: null,
      },
    ];

    await review.execute(new ReviewOrderCommand("ord_1", "stf_2", null, randomUUID()));

    expect(repo.saves).toBe(1);
    expect(repo.records.map((record) => [record.id, record.withdrawn])).toEqual([
      ["rev_old", { byStaffId: "stf_2", at: NOW }],
      ["rev_000001", null],
    ]);
    expect(durable.facts.map((fact) => fact.key)).toEqual([
      `${ORDER_REVIEW_WITHDRAWN}:rev_old`,
      `${ORDER_REVIEWED}:rev_000001`,
    ]);
  });
});

describe("WithdrawOrderReviewHandler", () => {
  it("retire le visa en cours, par un autre que son auteur, et publie le fait", async () => {
    const { repo, durable, review, withdraw } = setup();
    await review.execute(new ReviewOrderCommand("ord_1", "stf_1", null, randomUUID()));

    await withdraw.execute(new WithdrawOrderReviewCommand("ord_1", "stf_2", randomUUID()));

    expect(repo.records[0]?.withdrawn).toEqual({ byStaffId: "stf_2", at: NOW });
    expect(durable.facts.map((fact) => [fact.type, fact.key])).toEqual([
      [ORDER_REVIEWED, `${ORDER_REVIEWED}:rev_000001`],
      [ORDER_REVIEW_WITHDRAWN, `${ORDER_REVIEW_WITHDRAWN}:rev_000001`],
    ]);
  });

  it("refuse sans visa en cours", async () => {
    const { durable, withdraw } = setup();

    await expect(
      withdraw.execute(new WithdrawOrderReviewCommand("ord_1", "stf_2", randomUUID())),
    ).rejects.toBeInstanceOf(OrderNotReviewedError);
    expect(durable.facts).toEqual([]);
  });

  it("rejoué sous la même clé, ne lève pas « aucun visa à retirer »", async () => {
    const { repo, review, withdraw } = setup();
    await review.execute(new ReviewOrderCommand("ord_1", "stf_1", null, randomUUID()));
    const key = randomUUID();

    await withdraw.execute(new WithdrawOrderReviewCommand("ord_1", "stf_2", key));
    await withdraw.execute(new WithdrawOrderReviewCommand("ord_1", "stf_2", key));

    expect(repo.records).toHaveLength(1);
  });

  it("viser à nouveau après un retrait crée un second visa", async () => {
    const { repo, review, withdraw } = setup();
    await review.execute(new ReviewOrderCommand("ord_1", "stf_1", null, randomUUID()));
    await withdraw.execute(new WithdrawOrderReviewCommand("ord_1", "stf_2", randomUUID()));

    await review.execute(new ReviewOrderCommand("ord_1", "stf_2", null, randomUUID()));

    expect(repo.records.map((record) => record.withdrawn === null)).toEqual([false, true]);
  });
});
