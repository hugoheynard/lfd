import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { OrderBudgetCommitment } from "../../../domain/entities/order-budget-commitment.js";
import {
  BudgetCommitmentAlreadyInvoicedError,
  BudgetCommitmentInPeriodQuoteError,
  PrivatePayerBudgetCommitmentError,
} from "../../../domain/errors/budget-commitment-errors.js";
import { OrderNotFoundError } from "../../../domain/errors/order-errors.js";
import { ORDER_BUDGET_COMMITMENT_CORRECTED } from "../../../domain/events/order-budget-commitment-corrected.event.js";
import {
  AccountOrderEngagementReader,
  type AccountEngagement,
} from "../../../domain/ports/account-order-engagement.js";
import { OrderBudgetCommitmentRepository } from "../../../domain/ports/order-budget-commitment.repository.js";
import { PayerCommitmentRequirements } from "../../../domain/ports/payer-commitment-requirements.js";
import {
  QuotedOrdersReader,
  type QuotedOrder,
} from "../../../domain/ports/quoted-orders.reader.js";
import {
  PRIVATE_PAYER,
  type PayerCommitmentTerms,
} from "../../../domain/services/budget-commitment-rule.js";
import { BudgetCommitment } from "../../../domain/value-objects/budget-commitment.js";
import { CorrectOrderBudgetCommitmentCommand } from "../correct-order-budget-commitment.command.js";
import { CorrectOrderBudgetCommitmentHandler } from "../correct-order-budget-commitment.handler.js";
import { RecordingDurable } from "./durable-doubles.js";

/**
 * Corriger l'engagement budgétaire (E3′) — l'orchestration, ports doublés à
 * la main : le verrou d'abord, l'engagement comptable relu sous lui, puis
 * l'écriture et son fait ensemble.
 */

/** La ligne `orders` : son engagement rangé, et ce qui l'a touchée, dans l'ordre. */
class MemoryCommitments extends OrderBudgetCommitmentRepository {
  stored: { number: string | null; serviceCode: string | null } | null = {
    number: null,
    serviceCode: null,
  };
  constructor(readonly log: string[]) {
    super();
  }
  lock(orderId: string): Promise<OrderBudgetCommitment | null> {
    this.log.push("lock");
    if (this.stored === null) {
      return Promise.resolve(null);
    }
    return Promise.resolve(
      OrderBudgetCommitment.fromSnapshot({
        orderId,
        orderNumber: "ORD-0042",
        placedByUserId: "usr_1",
        payerCompanyId: "co_army",
        commitment: BudgetCommitment.stored(this.stored.number, this.stored.serviceCode),
      }),
    );
  }
  save(order: OrderBudgetCommitment): Promise<void> {
    this.log.push("save");
    const next = order.pendingCommitment;
    if (next !== undefined) {
      this.stored = { number: next?.number ?? null, serviceCode: next?.serviceCode ?? null };
    }
    return Promise.resolve();
  }
}

/**
 * L'engagement comptable, relu SOUS le verrou : `invoiceBefore` simule une
 * émission qui a pris le verrou la première et facturé la commande.
 */
class Engagement extends AccountOrderEngagementReader {
  current: AccountEngagement = { kind: "free" };
  constructor(private readonly log: string[]) {
    super();
  }
  engagementOf(): Promise<AccountEngagement | null> {
    this.log.push("engagement");
    return Promise.resolve(this.current);
  }
}

/** Le devis de période en attente qui porte la commande, relu sous le verrou. */
class Quoted extends QuotedOrdersReader {
  current: QuotedOrder | null = null;
  constructor(private readonly log: string[]) {
    super();
  }
  awaitingQuoteOf(): Promise<QuotedOrder | null> {
    this.log.push("quote");
    return Promise.resolve(this.current);
  }
}

class Requirements extends PayerCommitmentRequirements {
  terms: PayerCommitmentTerms = {
    kind: "public",
    commitmentRequired: true,
    serviceCodeRequired: false,
    defaultServiceCode: "SERV-RH",
    timing: "at_order",
  };
  of(): Promise<PayerCommitmentTerms> {
    return Promise.resolve(this.terms);
  }
}

function harness() {
  const log: string[] = [];
  const commitments = new MemoryCommitments(log);
  const engagement = new Engagement(log);
  const requirements = new Requirements();
  const quoted = new Quoted(log);
  const durable = new RecordingDurable();
  const handler = new CorrectOrderBudgetCommitmentHandler(
    commitments,
    engagement,
    requirements,
    quoted,
    durable,
    new FixedIdGenerator("bc"),
    new DirectUnitOfWork(),
  );
  const correct = (number: string | null) =>
    handler.execute(
      new CorrectOrderBudgetCommitmentCommand(
        "o_1",
        "staff_1",
        number === null ? null : { number, serviceCode: "" },
      ),
    );
  return { log, commitments, engagement, requirements, quoted, durable, correct };
}

describe("CorrectOrderBudgetCommitmentHandler", () => {
  it("avant facturation : écrit le numéro et son fait, sous le verrou de la ligne", async () => {
    const h = harness();

    await h.correct("1300012345");

    expect(h.log).toEqual(["lock", "engagement", "quote", "save"]);
    expect(h.commitments.stored).toEqual({ number: "1300012345", serviceCode: "SERV-RH" });
    expect(h.durable.facts).toHaveLength(1);
    expect(h.durable.facts[0]).toMatchObject({
      type: ORDER_BUDGET_COMMITMENT_CORRECTED,
      key: `${ORDER_BUDGET_COMMITMENT_CORRECTED}:o_1:bc_000001`,
      payload: {
        orderNumber: "ORD-0042",
        correctedByStaffId: "staff_1",
        before: null,
        after: { number: "1300012345", serviceCode: "SERV-RH" },
      },
    });
  });

  it("rejouée avec la même valeur : rien n'est réécrit, rien n'est journalisé", async () => {
    const h = harness();
    await h.correct("1300012345");

    await h.correct("1300012345");

    expect(h.log.filter((step) => step === "save")).toHaveLength(1);
    expect(h.durable.facts).toHaveLength(1);
  });

  /**
   * La course avec l'émission (E4″) : l'émission a pris le verrou de la
   * ligne la première et facturé ; la correction, qui attendait ce verrou,
   * relit une commande facturée et refuse — sans rien écrire.
   */
  it("après facturation (l'émission a gagné le verrou) : refusée, rien écrit", async () => {
    const h = harness();
    h.engagement.current = {
      kind: "invoiced",
      invoiceNumber: "FA-LFD-2026-000012",
      issuedOn: "2026-10-31",
    };

    await expect(h.correct("1300012345")).rejects.toThrow(BudgetCommitmentAlreadyInvoicedError);
    expect(h.log).toEqual(["lock", "engagement", "quote"]);
    expect(h.commitments.stored).toEqual({ number: null, serviceCode: null });
    expect(h.durable.facts).toEqual([]);
  });

  it("une commande d'un devis de période en attente : refusée, renvoyée au devis, rien écrit", async () => {
    const h = harness();
    h.quoted.current = { quoteId: "pq_1", quoteNumber: "D-20261031-1" };

    await expect(h.correct("1300012345")).rejects.toThrow(BudgetCommitmentInPeriodQuoteError);
    await expect(h.correct("1300012345")).rejects.toThrow(/devis de période D-20261031-1/u);
    expect(h.log.slice(0, 3)).toEqual(["lock", "engagement", "quote"]);
    expect(h.commitments.stored).toEqual({ number: null, serviceCode: null });
    expect(h.durable.facts).toEqual([]);
  });

  it("un payeur privé ne reçoit pas d'engagement", async () => {
    const h = harness();
    h.requirements.terms = PRIVATE_PAYER;

    await expect(h.correct("1300012345")).rejects.toThrow(PrivatePayerBudgetCommitmentError);
    expect(h.durable.facts).toEqual([]);
  });

  it("une commande inconnue : 404", async () => {
    const h = harness();
    h.commitments.stored = null;

    await expect(h.correct("1")).rejects.toThrow(OrderNotFoundError);
  });
});
