/**
 * E2E du **virement reçu** et des **impayés au virement** (plan
 * `documentation/comptabilite/le-paiement-par-virement.md`, V7,
 * V8, C7).
 *
 * Ce que seul le vrai serveur prouve : la facture d'une période au virement
 * se règle par le geste « virement reçu » — ses bons passent
 * `settled_by_transfer` dans la même transaction que le virement, le lot ne la
 * prélève jamais, « Mes factures » la dit réglée ; un écart est refusé en
 * euros ; la même clé rejouée n'écrit rien ; une autre clé est refusée en
 * nommant la facture ; une facture au prélèvement est refusée. Le retard
 * se lit après l'échéance.
 *
 * La scène (payeur au virement, facture émise) est `bank-transfer-scene.ts`.
 * Aucune date absolue : l'échéance est relue sur la facture émise.
 */
import type {
  MyIssuedInvoicesView,
  RecordedBankTransferView,
  UnpaidTransferInvoicesView,
} from "@lfd/contracts";
import {
  daysLateOf,
  transferOverdueFrom,
} from "../src/lafoliecoffee/accounting/domain/services/transfer-arrears.js";
import { jsonBody } from "./e2e-harness.js";
import { FIRST_KEY, record, SECOND_KEY, today, transferInvoice } from "./bank-transfer-scene.js";
import {
  clock,
  closesAt,
  COLLECTION,
  ctx,
  HOUR_MS,
  invoicedPayer,
  setUpEntity,
  staff,
  useCollectionReturnScene,
} from "./collection-returns-scene.js";
import { INTENT_KEY, freshIntent } from "./intent-key.js";

useCollectionReturnScene();

const UNPAID = "/admin/accounting/transfer-invoices/unpaid";

describe("« virement reçu » (V7)", () => {
  it("règle la facture : bons settled_by_transfer, virement gardé et journalisé, jamais prélevée", async () => {
    const { entityId, payer, invoice } = await transferInvoice();
    const body = {
      amountCents: invoice.totalTtcCents,
      receivedOn: today(),
      reference: invoice.number,
      invoiceIds: [invoice.id],
    };

    const first = jsonBody<RecordedBankTransferView>(
      await record(entityId, body, FIRST_KEY).expect(201),
    );
    const replay = jsonBody<RecordedBankTransferView>(
      await record(entityId, body, FIRST_KEY).expect(201),
    );

    expect(replay.transferId).toBe(first.transferId);
    expect(await ctx.prisma.receivedBankTransfer.count()).toBe(1);
    const links = await ctx.prisma.receivedBankTransferInvoice.findMany();
    expect(links).toEqual([
      { transferId: first.transferId, invoiceId: invoice.id, amountCents: invoice.totalTtcCents },
    ]);
    const orders = await ctx.prisma.invoiceOrder.findMany({ where: { invoiceId: invoice.id } });
    const states = await ctx.prisma.orderCollection.findMany();
    expect(states.map((state) => [state.orderId, state.state, state.bankTransferId])).toEqual(
      orders.map((order) => [order.orderId, "settled_by_transfer", first.transferId]),
    );
    const facts = await ctx.prisma.activityEvent.findMany({
      where: { type: "bank_transfer.received", subjectId: payer },
    });
    expect(facts).toHaveLength(1);

    // Le lot du 1er : rien à prélever.
    clock.set(new Date(closesAt.getTime() + 2 * HOUR_MS));
    await staff()
      .post(`${COLLECTION}/batches`)
      .set(INTENT_KEY, freshIntent())
      .send({ legalEntityId: entityId })
      .expect(409);
    expect(await ctx.prisma.collectionBatchLine.count()).toBe(0);
  });

  it("ressaisi avec une autre clé : 409 qui nomme la facture déjà réglée", async () => {
    const { entityId, invoice } = await transferInvoice();
    const body = {
      amountCents: invoice.totalTtcCents,
      receivedOn: today(),
      reference: "VIR CLIENT",
      invoiceIds: [invoice.id],
    };
    await record(entityId, body, FIRST_KEY).expect(201);

    const refusal = await record(entityId, body, SECOND_KEY).expect(409);

    expect(JSON.stringify(refusal.body)).toContain(`${invoice.number} est déjà réglée`);
    expect(await ctx.prisma.receivedBankTransfer.count()).toBe(1);
  });

  it("un écart est refusé (409, en euros) et rien n'est écrit", async () => {
    const { entityId, invoice } = await transferInvoice();

    const refusal = await record(
      entityId,
      {
        amountCents: invoice.totalTtcCents - 100,
        receivedOn: today(),
        reference: "VIR CLIENT",
        invoiceIds: [invoice.id],
      },
      FIRST_KEY,
    ).expect(409);

    expect(JSON.stringify(refusal.body)).toMatch(/écart de 1,00\s€ manquants/u);
    expect(await ctx.prisma.receivedBankTransfer.count()).toBe(0);
    expect(await ctx.prisma.orderCollection.count()).toBe(0);
  });

  it("une facture au prélèvement est refusée", async () => {
    const entityId = await setUpEntity(staff);
    const payer = await invoicedPayer(ctx, staff, entityId, closesAt);
    await staff()
      .post("/admin/accounting/monthly-invoices")
      .send({ legalEntityId: entityId, periodClosesAt: closesAt.toISOString() })
      .expect(200);
    const invoice = await ctx.prisma.invoice.findFirstOrThrow({ where: { payerCompanyId: payer } });

    const refusal = await record(
      entityId,
      {
        amountCents: invoice.totalTtcCents,
        receivedOn: today(),
        reference: "VIR",
        invoiceIds: [invoice.id],
      },
      FIRST_KEY,
    ).expect(409);

    expect(JSON.stringify(refusal.body)).toContain(
      `${invoice.number} ne se règle pas par virement`,
    );
  });
});

describe("le statut et les impayés d'une facture au virement (V8, C7)", () => {
  it("attendue, puis en retard après l'échéance, puis réglée — au suivi et dans « Mes factures »", async () => {
    const { entityId, payer, invoice } = await transferInvoice();
    const mine = async (): Promise<MyIssuedInvoicesView> =>
      jsonBody<MyIssuedInvoicesView>(
        await ctx.asSub("r5-owner").get(`/companies/${payer}/invoices`).expect(200),
      );
    const unpaid = async (query: string): Promise<UnpaidTransferInvoicesView> =>
      jsonBody<UnpaidTransferInvoicesView>(await staff().get(`${UNPAID}?${query}`).expect(200));

    expect((await mine()).invoices[0]?.settlement?.status).toBe("transfer_expected");
    expect((await unpaid(`payerCompanyId=${payer}`)).invoices).toEqual([
      expect.objectContaining({ invoiceId: invoice.id, overdue: false, daysLate: 0 }),
    ]);
    expect((await unpaid(`legalEntityId=${entityId}&overdue=true`)).invoices).toEqual([]);

    // Le lendemain du premier jour ouvré qui suit l'échéance, à midi : en
    // retard quel que soit le jour de la semaine où l'échéance tombe.
    const dueDay = invoice.dueOn.toISOString().slice(0, 10);
    const lateDay = transferOverdueFrom(transferOverdueFrom(dueDay));
    clock.set(new Date(Date.parse(lateDay) + 12 * HOUR_MS));

    expect((await mine()).invoices[0]?.settlement).toEqual({
      status: "transfer_overdue",
      date: invoice.dueOn.toISOString().slice(0, 10),
      otherInvoicesOnDebit: 0,
    });
    const overdue = await unpaid(`legalEntityId=${entityId}&overdue=true`);
    expect(overdue.invoices).toEqual([
      expect.objectContaining({
        number: invoice.number,
        overdue: true,
        daysLate: daysLateOf(dueDay, lateDay),
      }),
    ]);
    expect(overdue.overdueCents).toBe(invoice.totalTtcCents);

    const receivedOn = today();
    await record(
      entityId,
      {
        amountCents: invoice.totalTtcCents,
        receivedOn,
        reference: "VIR",
        invoiceIds: [invoice.id],
      },
      FIRST_KEY,
    ).expect(201);

    expect((await mine()).invoices[0]?.settlement).toEqual({
      status: "settled",
      date: receivedOn,
      otherInvoicesOnDebit: 0,
    });
    expect((await unpaid(`payerCompanyId=${payer}`)).invoices).toEqual([]);
  });
});
