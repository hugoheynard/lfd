import {
  ENTITY_ID,
  SEPTEMBER,
  STAFF_AUTHOR,
  mandate,
  order,
} from "../../../domain/services/__tests__/collection-fixtures.js";
import type { CollectableInvoice } from "../../../domain/services/collection-assembly.js";
import { CancelCollectionBatchCommand } from "../cancel-collection-batch.command.js";
import { ConstituteCollectionBatchesCommand } from "../constitute-collection-batches.command.js";
import { world } from "./collection-world.js";

/**
 * Le lot encaisse des factures émises (plan `plan-emission-de-la-facture.md`,
 * § 3, lot E4), à travers les handlers. Horloge fixe du monde, comparée au
 * cycle seulement.
 */

type World = ReturnType<typeof world>;

/** Deux bons du payeur, une facture qui les porte à un total qui n'est pas leur somme. */
function invoicedWorld(): { readonly w: World; readonly invoice: CollectableInvoice } {
  const w = world();
  const [a, b] = [order("c_port"), order("c_port")];
  const invoice: CollectableInvoice = {
    invoiceId: "inv_1",
    number: "FA-2026-000001",
    totalCents: 1_999,
    orderIds: [a.orderId, b.orderId],
  };
  w.candidates.orders = [a, b];
  w.candidates.invoices = [invoice];
  w.candidates.invoicingFloorAt = SEPTEMBER.startsAt;
  w.mandates.mandates = [mandate("c_port")];
  return { w, invoice };
}

async function constitute(w: World): Promise<string> {
  const [id] = await w.constitute.execute(
    new ConstituteCollectionBatchesCommand(ENTITY_ID, STAFF_AUTHOR),
  );
  return id ?? "";
}

describe("la constitution d'un lot de factures (E4)", () => {
  it("la ligne prélève Σ TTC de ses factures, les cite, et aucun arrêté ne naît", async () => {
    const { w, invoice } = invoicedWorld();

    const batchId = await constitute(w);

    const [line] = w.batches.saved.get(batchId)?.lines ?? [];
    expect(line?.amountCents).toBe(1_999);
    expect(line?.invoices).toEqual([{ invoiceId: invoice.invoiceId, number: invoice.number }]);
    expect(line?.orderIds).toEqual(invoice.orderIds);
    expect(w.statements.inserted).toEqual([]);
    expect(w.events.factTypes()).not.toContain("billing_statement.issued");
  });

  it("l'avis annonce le montant des factures et les cite par leur numéro", async () => {
    const { w, invoice } = invoicedWorld();

    const batchId = await constitute(w);

    const [notice] = w.noticeStore.notices.map((n) => n.toPersistence());
    expect(notice?.terms.amountCents).toBe(1_999);
    expect(notice?.line).toEqual({
      batchId,
      lineRank: 1,
      statementId: null,
      invoiceNumbers: [invoice.number],
      representedRejectionDay: null,
    });
  });

  /** Retours bancaires, § 2 bis-6 : la re-présentation entre au lot normal, son avis le dit. */
  it("une facture d'un rejet re-présenté : l'avis dit le jour du rejet", async () => {
    const { w, invoice } = invoicedWorld();
    w.rejections.days.set(invoice.invoiceId, "2026-10-16");

    await constitute(w);

    const [notice] = w.noticeStore.notices.map((n) => n.toPersistence());
    expect(notice?.line?.representedRejectionDay).toBe("2026-10-16");
  });

  it("un lot annulé rend ses factures à prélever : le suivant les reprend", async () => {
    const { w, invoice } = invoicedWorld();
    const first = await constitute(w);

    await w.cancel.execute(new CancelCollectionBatchCommand(first, "staff_1"));
    w.candidates.orders = w.candidates.orders.map((o) => ({
      ...o,
      collection: w.orders.saved.get(o.orderId)?.toPersistence() ?? null,
    }));
    const second = await constitute(w);

    expect(second).not.toBe(first);
    expect(w.batches.saved.get(second)?.lines[0]?.invoices.map((i) => i.number)).toEqual([
      invoice.number,
    ]);
  });

  it("un bon facturé ne reçoit jamais d'arrêté, et un bon sans facture attend la sienne", async () => {
    const { w } = invoicedWorld();
    const waiting = order("c_port");
    w.candidates.orders = [...w.candidates.orders, waiting];

    const batchId = await constitute(w);

    const lines = w.batches.saved.get(batchId)?.lines ?? [];
    expect(lines.flatMap((line) => line.orderIds)).not.toContain(waiting.orderId);
    expect(w.orders.saved.has(waiting.orderId)).toBe(false);
    expect(w.statements.inserted).toEqual([]);
  });
});
