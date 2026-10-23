import {
  BANK_REJECTION_REASON_MAX,
  BankRejectionAfterCollectionDayError,
  BatchNotDepositedError,
  InvalidBankRejectionReasonError,
  RejectedBatchHasReturnsError,
} from "../../errors/batch-bank-rejection-errors.js";
import { DepositedBatchNotCancellableError } from "../../errors/collection-errors.js";
import { BillingRhythmSetting } from "../../value-objects/billing-rhythm-setting.js";
import { InvoicingCalendar } from "../../services/invoicing-calendar.js";
import { Iban } from "../../value-objects/iban.js";
import { CollectionBatch, type ConstituteBatchInput } from "../collection-batch.js";
import { DEAD_BATCH_STATUSES, isDeadBatchStatus } from "../collection-batch-status.js";
import { OrderCollection } from "../order-collection.js";
import { OrderCollectionTransitionError } from "../../errors/collection-errors.js";

/**
 * « La banque a rejeté ce fichier » (plan `plan-lot-rejete-par-la-banque.md`).
 * Les jours ne sont comparés qu'entre eux : `today` est un paramètre, aucune
 * horloge n'est lue.
 */

const AFTER_CLOSE = new Date("2026-10-02T09:00:00.000Z");
const STAMP = { at: AFTER_CLOSE, staffId: "staff_1" };
const COLLECTION_DAY = "2026-10-15";
const BEFORE_DUE = "2026-10-14";
const REJECTION = { at: AFTER_CLOSE, staffId: "staff_2", reason: "PSR1 : fichier refusé" };

function input(overrides: Partial<ConstituteBatchInput> = {}): ConstituteBatchInput {
  return {
    id: "01JBQ7Z5K8M3QT9P2X4BZZZZZZ",
    legalEntityId: "le_1",
    scheme: "CORE",
    cycle: {
      startsAt: new Date("2026-08-31T22:00:00.000Z"),
      closesAt: new Date("2026-09-30T22:00:00.000Z"),
    },
    previousClosure: null,
    calendar: InvoicingCalendar.following(BillingRhythmSetting.initial()),
    constituted: { at: AFTER_CLOSE, by: { kind: "staff", staffId: "staff_1" } },
    unmandatedCompanies: [],
    requestedCollectionDay: COLLECTION_DAY,
    postponedFromDay: null,
    lines: [
      {
        rank: 1,
        endToEndId: "X-0001",
        mandateId: "m1",
        mandateReference: "RUM-1",
        mandateSignedAt: new Date("2026-08-01T10:00:00.000Z"),
        debtorCompanyId: "c1",
        debtorName: "Port",
        debtorIban: Iban.create("FR7630004000031234567890143"),
        debtorBic: null,
        sequence: "RCUR",
        amountCents: 1_000,
        ordersTotalCents: 1_000,
        orderIds: ["o1"],
        invoices: [],
        priorOrderCount: 0,
      },
    ],
    xml: "<xml/>",
    fileSha256: "0".repeat(64),
    ...overrides,
  };
}

function depositedBatch(overrides: Partial<ConstituteBatchInput> = {}): CollectionBatch {
  const batch = CollectionBatch.constitute(input(overrides));
  batch.recordDownload(AFTER_CLOSE);
  batch.markDeposited(STAMP, [], new Map([[1, "sent" as const]]));
  return batch;
}

describe("CollectionBatch.rejectByBank", () => {
  it("passe un lot déposé `rejected_by_bank`, garde le dépôt, nettoie le motif", () => {
    const batch = depositedBatch();

    batch.rejectByBank({ ...REJECTION, reason: "  PSR1 : fichier refusé " }, BEFORE_DUE, []);

    expect(batch.status).toBe("rejected_by_bank");
    expect(batch.toPersistence().deposited).toEqual(STAMP);
    expect(batch.toPersistence().rejected).toEqual(REJECTION);
  });

  it("refuse un lot préparé : il s'annule, il ne se rejette pas", () => {
    const batch = CollectionBatch.constitute(input());

    expect(() => batch.rejectByBank(REJECTION, BEFORE_DUE, [])).toThrow(BatchNotDepositedError);
    expect(() => batch.rejectByBank(REJECTION, BEFORE_DUE, [])).toThrow("l'annuler");
    expect(batch.status).toBe("constituted");
  });

  it("refuse un lot annulé, et un lot déjà rejeté (terminal)", () => {
    const cancelled = CollectionBatch.constitute(input());
    cancelled.cancel(STAMP);
    expect(() => cancelled.rejectByBank(REJECTION, BEFORE_DUE, [])).toThrow(BatchNotDepositedError);

    const rejected = depositedBatch();
    rejected.rejectByBank(REJECTION, BEFORE_DUE, []);
    expect(() => rejected.rejectByBank(REJECTION, BEFORE_DUE, [])).toThrow(BatchNotDepositedError);
  });

  it("un lot rejeté ne s'annule pas non plus", () => {
    const batch = depositedBatch();
    batch.rejectByBank(REJECTION, BEFORE_DUE, []);

    expect(() => batch.cancel(STAMP)).toThrow();
    expect(batch.status).toBe("rejected_by_bank");
  });

  it("refuse dès qu'une ligne a un retour, en nommant le payeur", () => {
    const batch = depositedBatch();

    expect(() => batch.rejectByBank(REJECTION, BEFORE_DUE, ["Port"])).toThrow(
      RejectedBatchHasReturnsError,
    );
    expect(() => batch.rejectByBank(REJECTION, BEFORE_DUE, ["Port"])).toThrow("(Port)");
    expect(batch.status).toBe("deposited");
  });

  it("refuse le jour de l'échéance et après (Q3), accepte la veille", () => {
    expect(() => depositedBatch().rejectByBank(REJECTION, COLLECTION_DAY, [])).toThrow(
      BankRejectionAfterCollectionDayError,
    );
    expect(() => depositedBatch().rejectByBank(REJECTION, "2026-10-20", [])).toThrow(
      BankRejectionAfterCollectionDayError,
    );
    expect(() => depositedBatch().rejectByBank(REJECTION, BEFORE_DUE, [])).not.toThrow();
  });

  it("refuse un lot d'avant le 2026-10-08, sans échéance figée", () => {
    const batch = CollectionBatch.rehydrate({
      ...depositedBatch().toPersistence(),
      requestedCollectionDay: null,
    });

    expect(() => batch.rejectByBank(REJECTION, BEFORE_DUE, [])).toThrow(
      BankRejectionAfterCollectionDayError,
    );
  });

  it("refuse un motif vide ou trop long", () => {
    expect(() =>
      depositedBatch().rejectByBank({ ...REJECTION, reason: "  " }, BEFORE_DUE, []),
    ).toThrow(InvalidBankRejectionReasonError);
    const long = "x".repeat(BANK_REJECTION_REASON_MAX + 1);
    expect(() =>
      depositedBatch().rejectByBank({ ...REJECTION, reason: long }, BEFORE_DUE, []),
    ).toThrow(InvalidBankRejectionReasonError);
    const max = "x".repeat(BANK_REJECTION_REASON_MAX);
    expect(() =>
      depositedBatch().rejectByBank({ ...REJECTION, reason: max }, BEFORE_DUE, []),
    ).not.toThrow();
  });

  it("l'annulation d'un lot déposé reste refusée (inchangé)", () => {
    expect(() => depositedBatch().cancel(STAMP)).toThrow(DepositedBatchNotCancellableError);
  });
});

describe("isDeadBatchStatus", () => {
  it("annulé et rejeté par la banque sont morts ; préparé et déposé vivent", () => {
    expect(DEAD_BATCH_STATUSES).toEqual(["cancelled", "rejected_by_bank"]);
    expect(isDeadBatchStatus("cancelled")).toBe(true);
    expect(isDeadBatchStatus("rejected_by_bank")).toBe(true);
    expect(isDeadBatchStatus("constituted")).toBe(false);
    expect(isDeadBatchStatus("deposited")).toBe(false);
  });
});

describe("OrderCollection.releaseRejected", () => {
  function collected(): OrderCollection {
    const order = OrderCollection.due("o1", 1_000, AFTER_CLOSE);
    order.batch("b1", 1, AFTER_CLOSE);
    order.collect(AFTER_CLOSE);
    return order;
  }

  it("`collected` → `due`, sans lot ni ligne", () => {
    const order = collected();

    order.releaseRejected(AFTER_CLOSE);

    expect(order.toPersistence()).toMatchObject({ state: "due", batchId: null, lineRank: null });
  });

  it("refuse une commande `returned` : son retour attend une décision humaine", () => {
    const order = collected();
    order.bounce(AFTER_CLOSE);

    expect(() => order.releaseRejected(AFTER_CLOSE)).toThrow(OrderCollectionTransitionError);
  });

  it("refuse une commande seulement `batched` : son lot n'a pas été déposé", () => {
    const order = OrderCollection.due("o1", 1_000, AFTER_CLOSE);
    order.batch("b1", 1, AFTER_CLOSE);

    expect(() => order.releaseRejected(AFTER_CLOSE)).toThrow(OrderCollectionTransitionError);
  });
});
