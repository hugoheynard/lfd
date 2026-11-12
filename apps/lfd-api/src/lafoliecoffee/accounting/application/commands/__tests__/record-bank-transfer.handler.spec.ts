import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { inMemoryIntents } from "../../../../../platform/intent/__tests__/in-memory-gesture-intent.ledger.js";
import {
  InsideUnitOfWork,
  SealingIntentLedger,
} from "../../../../../platform/intent/__tests__/sealing-intent-ledger.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { OrderCollection } from "../../../domain/entities/order-collection.js";
import type { TransferInvoice } from "../../../domain/entities/received-bank-transfer.js";
import {
  BankTransferAmountMismatchError,
  BankTransferOrderOutOfScopeError,
  InvoiceAlreadySettledByTransferError,
} from "../../../domain/errors/bank-transfer-errors.js";
import { OrderCollectionTransitionError } from "../../../domain/errors/collection-errors.js";
import { LegalEntityNotFoundError } from "../../../domain/errors/accounting-errors.js";
import { RecordBankTransferCommand } from "../record-bank-transfer.command.js";
import { RecordBankTransferHandler } from "../record-bank-transfer.handler.js";
import {
  LoggingInvoicingLock,
  MemoryReceivedTransfers,
  StoreTransferInvoices,
} from "./bank-transfer-doubles.js";
import { MemoryOrderCollections } from "./collection-doubles.js";
import { declaredEntity, SettingSteps, StepEntities } from "./mandate-setting-doubles.js";

/** Horloge FIXE : le jour de réception est comparé à son jour de Paris, rien d'autre. */
const NOW = new Date("2026-11-20T09:00:00.000Z");

const invoice = (over: Partial<TransferInvoice> = {}): TransferInvoice => ({
  invoiceId: "inv_1",
  number: "FA-LFD-2026-000001",
  legalEntityId: "le1",
  payerCompanyId: "cmp_port",
  payerName: "Boulangerie du Port",
  paymentMeansCode: "58",
  isCreditNote: false,
  remainingCents: 12_000,
  settledByTransferId: null,
  orderIds: ["o2", "o1"],
  ...over,
});
const SECOND = invoice({
  invoiceId: "inv_2",
  number: "FA-LFD-2026-000002",
  remainingCents: 3_455,
  orderIds: ["o3"],
});

function world() {
  const log: string[] = [];
  const entities = new StepEntities(new SettingSteps());
  entities.rows.set("le1", declaredEntity());
  const transfers = new MemoryReceivedTransfers(log);
  const orders = new MemoryOrderCollections();
  for (const id of ["o1", "o2", "o3"]) {
    orders.saved.set(id, OrderCollection.due(id, 5_000, NOW));
  }
  const events = new RecordingPublisher();
  const uow = new InsideUnitOfWork();
  const ledger = new SealingIntentLedger(() => uow.inside);
  const handler = new RecordBankTransferHandler(
    entities,
    new StoreTransferInvoices([invoice(), SECOND], transfers),
    transfers,
    orders,
    new LoggingInvoicingLock(log),
    new FixedIdGenerator("vir"),
    new FixedClock(NOW),
    events,
    uow,
    inMemoryIntents(ledger),
  );
  const record = (
    over: Partial<RecordBankTransferCommand["entry"]> = {},
    intentKey = "cle-1",
    legalEntityId = "le1",
  ): Promise<string> =>
    handler.execute(
      new RecordBankTransferCommand(
        legalEntityId,
        {
          amountCents: 15_455,
          receivedOn: "2026-11-18",
          reference: "FA-LFD-2026-000001 FA-LFD-2026-000002",
          invoiceIds: ["inv_1", "inv_2"],
          ...over,
        },
        "staff_compta",
        intentKey,
      ),
    );
  return { log, transfers, orders, events, ledger, record };
}

describe("RecordBankTransferHandler — « virement reçu » (V7)", () => {
  it("règle chaque bon des factures par l'agrégat, sous le verrou des bons pris d'abord", async () => {
    const { log, transfers, orders, record } = world();

    const transferId = await record();

    expect(transferId).toBe("vir_000001");
    expect(log).toEqual(["lock:o1", "lock:o2", "lock:o3", "transfer:add:vir_000001"]);
    expect(transfers.added).toHaveLength(1);
    for (const id of ["o1", "o2", "o3"]) {
      expect(orders.saved.get(id)?.toPersistence()).toMatchObject({
        state: "settled_by_transfer",
        bankTransferId: "vir_000001",
        settledByStaffId: "staff_compta",
      });
    }
  });

  it("journalise « virement reçu » sur le payeur, et scelle l'intention DANS la transaction", async () => {
    const { events, ledger, record } = world();

    await record();

    const payload: unknown = expect.objectContaining({
      amountCents: 15_455,
      receivedOn: "2026-11-18",
      invoices: ["FA-LFD-2026-000001", "FA-LFD-2026-000002"],
      legalEntity: { id: "le1", name: "La Folie Douce" },
    });
    expect(events.traced.map((event) => event.journalFact())).toEqual([
      expect.objectContaining({
        type: "bank_transfer.received",
        subjectType: "company",
        subjectId: "cmp_port",
        payload,
      }),
    ]);
    expect(ledger.resolutions).toEqual(["in tx"]);
  });

  it("rejouée avec la même clé : le même virement, un seul écrit, un seul fait", async () => {
    const { transfers, events, record } = world();

    const first = await record();
    const replay = await record();

    expect(replay).toBe(first);
    expect(transfers.added).toHaveLength(1);
    expect(events.traced).toHaveLength(1);
  });

  it("ressaisi avec une autre clé : refusé, la facture déjà réglée nommée", async () => {
    const { transfers, record } = world();
    await record();

    await expect(record({}, "cle-2")).rejects.toThrow(InvoiceAlreadySettledByTransferError);
    await expect(record({}, "cle-3")).rejects.toThrow(/FA-LFD-2026-000001/u);
    expect(transfers.added).toHaveLength(1);
  });

  it("un écart est refusé avant d'écrire quoi que ce soit, et l'intention est rendue", async () => {
    const { transfers, orders, record } = world();

    await expect(record({ amountCents: 15_000 })).rejects.toThrow(BankTransferAmountMismatchError);

    expect(transfers.added).toEqual([]);
    expect(orders.saved.get("o1")?.stateName).toBe("due");
    // La même clé, corrigée, réessaie.
    await expect(record({ amountCents: 15_455 })).resolves.toBe("vir_000002");
  });

  it("un bon déjà dans un lot refuse le virement entier", async () => {
    const { transfers, orders, record } = world();
    orders.saved.get("o3")?.batch("lot_1", 1, NOW);

    await expect(record()).rejects.toThrow(OrderCollectionTransitionError);
    expect(transfers.added).toEqual([]);
  });

  it("un bon hors de l'assiette d'encaissement est refusé en nommant sa facture", async () => {
    const { orders, record } = world();
    orders.saved.delete("o3");

    // Une seule tentative : les doubles en mémoire ne rejouent pas l'annulation.
    const refusal = await record().catch((error: unknown) => error);

    expect(refusal).toBeInstanceOf(BankTransferOrderOutOfScopeError);
    expect(String(refusal)).toMatch(/FA-LFD-2026-000002/u);
  });

  it("une entité inconnue est refusée", async () => {
    const { record } = world();

    await expect(record({}, "cle-1", "le_inconnue")).rejects.toThrow(LegalEntityNotFoundError);
  });
});
