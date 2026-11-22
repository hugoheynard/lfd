import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { BankTransferGapFoundEvent } from "../../../domain/events/bank-transfer-gap.event.js";
import {
  BankTransferTraceReader,
  type InvoiceTrace,
  type SettledOrderTrace,
} from "../../../domain/ports/bank-transfer-trace.reader.js";
import {
  CheckBankTransferConsistencyHandler,
  CONSISTENCY_LOOKBACK_MS,
} from "../check-bank-transfer-consistency.handler.js";
import { MemoryBankTransfers } from "./bank-transfer-doubles.js";

/** La trace de la facturation, fixée par le test ; elle note la fenêtre demandée. */
class FixedTrace extends BankTransferTraceReader {
  readonly sinces: Date[] = [];
  constructor(
    private readonly orders: readonly SettledOrderTrace[],
    private readonly invoices: readonly InvoiceTrace[],
  ) {
    super();
  }
  settledOrdersSince(since: Date): Promise<readonly SettledOrderTrace[]> {
    this.sinces.push(since);
    return Promise.resolve(this.orders);
  }
  invoicesOf(invoiceIds: readonly string[]): Promise<readonly InvoiceTrace[]> {
    return Promise.resolve(
      this.invoices.filter((invoice) => invoiceIds.includes(invoice.invoiceId)),
    );
  }
}

const NOW = new Date(10 * CONSISTENCY_LOOKBACK_MS);

async function recordedTransfer(bankTransfers: MemoryBankTransfers): Promise<void> {
  await bankTransfers.record({
    id: "vir_1",
    receivedInto: "le1",
    payerRef: "cmp_port",
    amountCents: 1_000,
    receivedOn: "2026-11-18",
    reference: "VIR",
    recordedAt: NOW,
    recordedBy: "staff_compta",
    parts: [{ subject: { type: "invoice", id: "inv_1" }, amountCents: 1_000 }],
  });
}

function world(orders: readonly SettledOrderTrace[], invoices: readonly InvoiceTrace[]) {
  const bankTransfers = new MemoryBankTransfers([]);
  const trace = new FixedTrace(orders, invoices);
  const events = new RecordingPublisher();
  const handler = new CheckBankTransferConsistencyHandler(
    trace,
    bankTransfers,
    events,
    new FixedClock(NOW),
  );
  const run = () => handler.execute();
  return { bankTransfers, trace, events, run };
}

const SETTLED_ORDER: SettledOrderTrace = {
  orderId: "o1",
  bankTransferId: "vir_1",
  invoiceId: "inv_1",
  invoiceNumber: "FA-1",
};
const SETTLED_INVOICE: InvoiceTrace = {
  invoiceId: "inv_1",
  number: "FA-1",
  orders: [{ orderId: "o1", settledByTransferId: "vir_1" }],
};

describe("CheckBankTransferConsistencyHandler — le contrôle de nuit (§3.6)", () => {
  it("les deux côtés d'accord : aucun écart, rien ne sonne", async () => {
    const { bankTransfers, events, run } = world([SETTLED_ORDER], [SETTLED_INVOICE]);
    await recordedTransfer(bankTransfers);

    const report = await run();

    expect(report).toEqual({
      since: new Date(NOW.getTime() - CONSISTENCY_LOOKBACK_MS).toISOString(),
      checkedOrders: 1,
      checkedTransfers: 1,
      gaps: 0,
    });
    expect(events.published).toEqual([]);
  });

  it("relit la fenêtre des trois dernières nuits, à l'horloge", async () => {
    const { trace, run } = world([], []);

    await run();

    expect(trace.sinces).toEqual([new Date(NOW.getTime() - CONSISTENCY_LOOKBACK_MS)]);
  });

  it("un bon qui cite un virement absent du bloc : un écart publié, rien de corrigé", async () => {
    const { bankTransfers, events, run } = world([SETTLED_ORDER], []);

    const report = await run();

    expect(report.gaps).toBe(1);
    expect(events.published).toEqual([
      new BankTransferGapFoundEvent({
        kind: "order_without_allocation",
        transferId: "vir_1",
        invoiceId: "inv_1",
        invoiceNumber: "FA-1",
        orderId: "o1",
      }),
    ]);
    expect(bankTransfers.recorded).toEqual([]);
  });

  it("un virement du bloc dont la facture n'a pas ses bons réglés : l'écart nomme le bon", async () => {
    const { bankTransfers, events, run } = world(
      [],
      [{ ...SETTLED_INVOICE, orders: [{ orderId: "o1", settledByTransferId: null }] }],
    );
    await recordedTransfer(bankTransfers);

    await run();

    expect(events.published).toEqual([
      new BankTransferGapFoundEvent({
        kind: "allocation_order_not_settled",
        transferId: "vir_1",
        invoiceId: "inv_1",
        invoiceNumber: "FA-1",
        orderId: "o1",
      }),
    ]);
  });
});
