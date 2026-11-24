import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { OrderBudgetCommitment } from "../../../domain/entities/order-budget-commitment.js";
import {
  BudgetCommitmentAlreadyNumberedError,
  BudgetCommitmentNotInQuoteError,
} from "../../../domain/errors/budget-commitment-errors.js";
import { OrderNotFoundError } from "../../../domain/errors/order-errors.js";
import { ORDER_BUDGET_COMMITMENT_RECEIVED } from "../../../domain/events/order-budget-commitment-received.event.js";
import { OrderBudgetCommitmentRepository } from "../../../domain/ports/order-budget-commitment.repository.js";
import {
  QuotedOrdersReader,
  type QuotedOrder,
} from "../../../domain/ports/quoted-orders.reader.js";
import { BudgetCommitment } from "../../../domain/value-objects/budget-commitment.js";
import { RecordingDurable } from "../../commands/__tests__/durable-doubles.js";
import { QuotedCommitmentAccepting } from "../quoted-commitment-accepting.js";

/**
 * Le numéro reçu sur un devis, écrit par la commande (QD6) — l'orchestration,
 * ports doublés à la main : chaque commande verrouillée, son devis relu,
 * jugée par l'agrégat, écrite, et son fait publié.
 */

const QUOTE: QuotedOrder = { quoteId: "pq_1", quoteNumber: "D-20261031-1" };

/** Les lignes `orders` : leur engagement rangé, et ce qui les a touchées. */
class MemoryCommitments extends OrderBudgetCommitmentRepository {
  readonly stored = new Map<string, { number: string | null; serviceCode: string | null }>([
    ["o_1", { number: null, serviceCode: "SERV-RH" }],
    ["o_2", { number: null, serviceCode: "SERV-RH" }],
  ]);
  readonly log: string[] = [];
  lock(orderId: string): Promise<OrderBudgetCommitment | null> {
    this.log.push(`lock:${orderId}`);
    const row = this.stored.get(orderId);
    return Promise.resolve(
      row === undefined
        ? null
        : OrderBudgetCommitment.fromSnapshot({
            orderId,
            orderNumber: `ORD-${orderId}`,
            placedByUserId: "usr_1",
            payerCompanyId: "co_army",
            commitment: BudgetCommitment.stored(row.number, row.serviceCode),
          }),
    );
  }
  save(order: OrderBudgetCommitment): Promise<void> {
    this.log.push(`save:${order.orderId}`);
    const next = order.pendingCommitment;
    if (next !== undefined && next !== null) {
      this.stored.set(order.orderId, { number: next.number, serviceCode: next.serviceCode });
    }
    return Promise.resolve();
  }
}

class Quoted extends QuotedOrdersReader {
  readonly quotes = new Map<string, QuotedOrder>([
    ["o_1", QUOTE],
    ["o_2", QUOTE],
  ]);
  awaitingQuoteOf(orderId: string): Promise<QuotedOrder | null> {
    return Promise.resolve(this.quotes.get(orderId) ?? null);
  }
}

function harness() {
  const commitments = new MemoryCommitments();
  const quoted = new Quoted();
  const durable = new RecordingDurable();
  const accepting = new QuotedCommitmentAccepting(
    commitments,
    quoted,
    durable,
    new DirectUnitOfWork(),
  );
  const accept = (number = "1300012345", orderIds = ["o_1", "o_2"]) =>
    accepting.acceptQuoted({
      quoteId: QUOTE.quoteId,
      quoteNumber: QUOTE.quoteNumber,
      orderIds,
      number,
      staffUserId: "staff_1",
    });
  return { commitments, quoted, durable, accept };
}

describe("QuotedCommitmentAccepting", () => {
  it("écrit le numéro sur chaque commande du devis, sous son verrou, et publie un fait par commande", async () => {
    const h = harness();

    await h.accept();

    expect(h.commitments.log).toEqual(["lock:o_1", "save:o_1", "lock:o_2", "save:o_2"]);
    expect([...h.commitments.stored.values()]).toEqual([
      { number: "1300012345", serviceCode: "SERV-RH" },
      { number: "1300012345", serviceCode: "SERV-RH" },
    ]);
    expect(h.durable.facts).toEqual([
      expect.objectContaining({
        type: ORDER_BUDGET_COMMITMENT_RECEIVED,
        key: `${ORDER_BUDGET_COMMITMENT_RECEIVED}:o_1:pq_1`,
        payload: expect.objectContaining({
          orderNumber: "ORD-o_1",
          receivedByStaffId: "staff_1",
          quoteNumber: "D-20261031-1",
          commitment: { number: "1300012345", serviceCode: "SERV-RH" },
        }) as unknown,
      }),
      expect.objectContaining({ key: `${ORDER_BUDGET_COMMITMENT_RECEIVED}:o_2:pq_1` }),
    ]);
  });

  it("refuse une commande qui n'est plus dans ce devis en attente", async () => {
    const h = harness();
    h.quoted.quotes.delete("o_2");

    await expect(h.accept()).rejects.toThrow(BudgetCommitmentNotInQuoteError);
  });

  it("refuse une commande qui porte déjà un numéro", async () => {
    const h = harness();
    h.commitments.stored.set("o_1", { number: "1300000000", serviceCode: "SERV-RH" });

    await expect(h.accept()).rejects.toThrow(BudgetCommitmentAlreadyNumberedError);
    expect(h.durable.facts).toEqual([]);
  });

  it("une commande inconnue : 404", async () => {
    const h = harness();

    await expect(h.accept("1300012345", ["absente"])).rejects.toThrow(OrderNotFoundError);
  });
});
